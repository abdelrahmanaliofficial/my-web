<?php

namespace App\Models;

use App\Authorization\PermissionCatalog;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmailContract
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    public const ROLES = ['super_admin', 'custom_admin', 'client'];

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_active',
        'email_verified_at',
        'suspended_at',
        'last_login_at',
    ];

    protected $appends = ['role'];

    protected $hidden = [
        'password',
        'remember_token',
        'permissions',
        'role_id',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'suspended_at' => 'datetime',
            'last_login_at' => 'datetime',
            'auth_version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(function (User $user): void {
            // A role change must never leave custom-admin grants attached to a client or Super Admin.
            if (!$user->hasRole('custom_admin') && $user->permissionRecords()->exists()) {
                $user->permissionRecords()->detach();
                $user->unsetRelation('permissionRecords');
                DB::table('users')->where('id', $user->id)->update(['permissions' => json_encode([])]);
            }
        });
    }

    /** The normalized role relation is authoritative. The legacy role column is retained as a compatibility mirror. */
    public function roleRecord(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function permissionsRelation(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_user')
            ->withPivot(['granted_by'])
            ->withTimestamps();
    }

    /** Alias used internally for concise eager loading. */
    public function permissionRecords(): BelongsToMany
    {
        return $this->permissionsRelation();
    }

    public function setRoleAttribute(mixed $value): void
    {
        $slug = is_string($value) ? strtolower(trim($value)) : '';
        if (!in_array($slug, self::ROLES, true)) {
            throw new InvalidArgumentException('Unknown application role.');
        }

        $roleId = Role::query()->where('slug', $slug)->value('id');
        if (!$roleId) {
            throw new InvalidArgumentException('The normalized role catalogue has not been initialized. Run the RBAC migration first.');
        }

        $this->attributes['role_id'] = (int) $roleId;
        $this->unsetRelation('roleRecord');
        // Compatibility mirror for older read-only integrations. Authorization never reads this column.
        $this->attributes['role'] = $slug;
    }

    public function getRoleAttribute(mixed $value): ?string
    {
        if ($this->relationLoaded('roleRecord')) {
            return $this->getRelation('roleRecord')?->slug;
        }

        if (empty($this->attributes['role_id'])) {
            return null;
        }

        return $this->roleRecord?->slug;
    }

    /** Return permission slugs from the normalized relationship, never from the legacy JSON mirror. */
    public function getPermissionsAttribute(mixed $value): array
    {
        if ($this->relationLoaded('permissionRecords')) {
            return $this->getRelation('permissionRecords')->pluck('slug')->sort()->values()->all();
        }

        return $this->permissionRecords()->orderBy('slug')->pluck('slug')->all();
    }

    public function syncPermissions(array $permissionSlugs, ?User $grantor = null): void
    {
        foreach ($permissionSlugs as $slug) {
            if (!is_string($slug) || trim($slug) === '') {
                throw new InvalidArgumentException('Permission slugs must be non-empty strings.');
            }
        }

        $slugs = array_values(array_unique(array_map(
            static fn (string $slug): string => trim($slug),
            $permissionSlugs
        )));

        if (!$this->exists) {
            throw new InvalidArgumentException('Save the user before assigning permissions.');
        }

        if (!$this->hasRole('custom_admin') && $slugs !== []) {
            throw new InvalidArgumentException('Only custom administrators may receive explicit permissions.');
        }

        if ($grantor !== null) {
            if (!$grantor->isActive()) {
                throw new InvalidArgumentException('An inactive account cannot grant permissions.');
            }

            if ($grantor->hasRole('custom_admin')) {
                if ((int) $grantor->id === (int) $this->id) {
                    throw new InvalidArgumentException('Delegated team managers cannot modify their own permissions.');
                }

                $requiredTeamPermission = $slugs === [] ? 'create_team' : 'manage_team';
                if (!$grantor->hasPermissionTo($requiredTeamPermission)) {
                    throw new InvalidArgumentException('This Custom Admin does not have the required team-management permission.');
                }

                foreach ($slugs as $slug) {
                    if (!$grantor->hasPermissionTo($slug)) {
                        throw new InvalidArgumentException('A Custom Admin cannot grant permissions they do not hold.');
                    }
                }
            } elseif (!$grantor->hasRole('super_admin')) {
                throw new InvalidArgumentException('Only Super Admins or delegated team managers may grant permissions.');
            }
        }

        $records = Permission::query()->whereIn('slug', $slugs)->get()->keyBy('slug');
        if ($records->count() !== count($slugs)) {
            $unknown = array_values(array_diff($slugs, $records->keys()->all()));
            throw new InvalidArgumentException('Unknown permission(s): ' . implode(', ', $unknown));
        }

        $sync = [];
        foreach ($records as $record) {
            $sync[$record->id] = ['granted_by' => $grantor?->id];
        }

        $this->permissionRecords()->sync($sync);
        $this->unsetRelation('permissionRecords');

        // Keep the old JSON column in sync for compatibility only; it is not used for authorization.
        DB::table('users')->where('id', $this->id)->update(['permissions' => json_encode($slugs, JSON_THROW_ON_ERROR)]);
    }

    public function hasPermissionTo(string $permission): bool
    {
        if (!$this->isActive()) {
            return false;
        }

        if ($this->hasRole('super_admin')) {
            return true;
        }

        if (!$this->hasRole('custom_admin')) {
            return false;
        }

        // Unknown permissions never become valid merely because a Custom Admin
        // has a manage grant for a similarly named module.
        if (!PermissionCatalog::has($permission)) {
            return false;
        }

        $assigned = $this->permissions;
        if (in_array($permission, $assigned, true)) {
            return true;
        }

        // A manage_<module> grant implies only the four canonical CRUD actions
        // in that same module. It does not imply manage itself or unknown actions.
        [$action, $module] = array_pad(explode('_', $permission, 2), 2, '');
        return in_array($action, ['view', 'create', 'update', 'delete'], true)
            && $module !== ''
            && in_array('manage_' . $module, $assigned, true);
    }

    /** @param list<string> $permissions */
    public function hasAnyPermission(array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($this->hasPermissionTo($permission)) {
                return true;
            }
        }

        return false;
    }

    public function hasRole(string ...$roles): bool
    {
        $current = $this->role;
        return $current !== null && in_array($current, $roles, true);
    }

    public function isActive(): bool
    {
        return (bool) $this->is_active && $this->suspended_at === null && $this->role !== null;
    }

    /** Increment this value to invalidate every previously issued browser session. */
    public function bumpAuthVersion(): void
    {
        $this->forceFill([
            'auth_version' => ((int) $this->auth_version) + 1,
            'remember_token' => Str::random(60),
        ])->save();
    }

    public function clientProfile()
    {
        return $this->hasOne(Client::class);
    }

    public function assignedProjects(): HasMany
    {
        return $this->hasMany(Project::class, 'assigned_team_member_id');
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(AdminActivityLog::class, 'actor_id');
    }

    public function toSafeArray(): array
    {
        $this->loadMissing(['roleRecord:id,name,slug', 'permissionRecords:id,slug']);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->roleRecord?->slug,
            'permissions' => $this->getPermissionsAttribute(null),
            'is_active' => (bool) $this->is_active,
            'email_verified_at' => $this->email_verified_at?->toISOString(),
            'suspended_at' => $this->suspended_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'last_login_at' => $this->last_login_at?->toISOString(),
        ];
    }
}
