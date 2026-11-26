<?php

namespace App\Authorization;

/**
 * Canonical allow-list for Custom Admin permissions. Team administration can
 * be delegated explicitly, with server-side limits on permission delegation.
 */
final class PermissionCatalog
{
    /** @var array<string, string> */
    private const MODULES = [
        'stats' => 'Statistics',
        'leads' => 'Leads',
        'services' => 'Services',
        'projects' => 'Projects',
        'clients' => 'Clients',
        'billing' => 'Billing',
        'messages' => 'Messages',
        'settings' => 'Website settings',
        'bookings' => 'Bookings',
        'portfolio' => 'Portfolio',
        'testimonials' => 'Testimonials',
        'faqs' => 'FAQs',
        'blog' => 'Blog',
        'partners' => 'Partners',
        'team' => 'Team administration',
    ];

    /** @var array<string, string> */
    private const ACTIONS = [
        'view' => 'View',
        'create' => 'Create',
        'update' => 'Update',
        'delete' => 'Delete',
        'manage' => 'Manage all',
    ];

    /** @return array<string, array{module:string, action:string, label:string}> */
    public static function definitions(): array
    {
        $definitions = [];

        foreach (self::MODULES as $module => $moduleLabel) {
            foreach (self::ACTIONS as $action => $actionLabel) {
                $slug = $action . '_' . $module;
                $definitions[$slug] = [
                    'module' => $module,
                    'action' => $action,
                    'label' => $actionLabel . ' ' . $moduleLabel,
                ];
            }
        }

        return $definitions;
    }

    /** @return list<string> */
    public static function slugs(): array
    {
        return array_keys(self::definitions());
    }

    public static function has(string $slug): bool
    {
        return array_key_exists($slug, self::definitions());
    }

    /** @return list<array{slug:string,module:string,action:string,label:string}> */
    public static function asList(): array
    {
        $items = [];
        foreach (self::definitions() as $slug => $definition) {
            $items[] = ['slug' => $slug] + $definition;
        }

        return $items;
    }
}
