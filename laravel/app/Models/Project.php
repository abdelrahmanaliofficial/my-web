<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Str;

class Project extends Model
{
    use HasFactory;

    public const STATUSES = [
        'planning',
        'in_progress',
        'waiting_for_client',
        'under_review',
        'completed',
        'on_hold',
    ];

    public const PRIORITIES = [
        'low',
        'medium',
        'high',
        'urgent',
    ];

    protected $fillable = [
        'project_code',
        'client_id',
        'name',
        'title',
        'service_category',
        'description',
        'summary',
        'start_date',
        'expected_completion_date',
        'due_date',
        'status',
        'priority',
        'progress_percentage',
        'assigned_team_member_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'expected_completion_date' => 'date',
        'due_date' => 'date',
        'progress_percentage' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Project $project): void {
            if (empty($project->project_code)) {
                $project->project_code = static::generateUniqueCode();
            }
            if (empty($project->name) && !empty($project->title)) {
                $project->name = $project->title;
            }
            if (empty($project->title) && !empty($project->name)) {
                $project->title = $project->name;
            }
            if (empty($project->expected_completion_date) && !empty($project->due_date)) {
                $project->expected_completion_date = $project->due_date;
            }
            if (empty($project->due_date) && !empty($project->expected_completion_date)) {
                $project->due_date = $project->expected_completion_date;
            }
        });
    }

    public static function generateUniqueCode(): string
    {
        do {
            $code = 'PRJ-' . strtoupper(Str::random(6));
        } while (static::where('project_code', $code)->exists());

        return $code;
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function assignedTeamMember(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_team_member_id');
    }

    public function milestones(): HasMany
    {
        return $this->hasMany(ProjectMilestone::class)->orderBy('sort_order')->orderBy('id');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(ProjectTask::class)->orderBy('deadline')->orderBy('id');
    }

    public function clientVisibleTasks(): HasMany
    {
        return $this->hasMany(ProjectTask::class)
            ->where('is_client_visible', true)
            ->orderBy('deadline')
            ->orderBy('id');
    }

    public function updates(): HasMany
    {
        return $this->hasMany(ProjectUpdate::class)->orderByDesc('created_at');
    }

    public function clientVisibleUpdates(): HasMany
    {
        return $this->hasMany(ProjectUpdate::class)
            ->where('is_internal', false)
            ->where('type', '!=', 'internal_note')
            ->orderByDesc('created_at');
    }

    public function files(): MorphMany
    {
        return $this->morphMany(MediaFile::class, 'owner')->orderByDesc('created_at');
    }
}
