<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $appearanceRecord = SiteSetting::query()->where('key', 'appearance')->first();
        $pagesRecord = SiteSetting::query()->where('key', 'pages')->first();
        $appearance = is_array($appearanceRecord?->value) ? $appearanceRecord->value : [];
        $pages = is_array($pagesRecord?->value) ? $pagesRecord->value : [];

        return response()->json([
            'success' => true,
            'data' => [
                'appearance' => is_array($appearance) ? $appearance : [],
                'pages' => is_array($pages) ? $pages : [],
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizeSettingsManagement($request);

        $validated = $request->validate([
            'appearance' => ['sometimes', 'array:logo_url,logo_dark_url,logo_display,primary_color'],
            'appearance.logo_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'appearance.logo_dark_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'appearance.logo_display' => ['sometimes', 'in:logo_only,logo_and_text,text_only,hidden'],
            'appearance.primary_color' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'pages' => ['sometimes', 'array:show_stats,show_pricing,show_portfolio,show_testimonials'],
            'pages.show_stats' => ['sometimes', 'boolean'],
            'pages.show_pricing' => ['sometimes', 'boolean'],
            'pages.show_portfolio' => ['sometimes', 'boolean'],
            'pages.show_testimonials' => ['sometimes', 'boolean'],
        ]);

        foreach (['appearance', 'pages'] as $section) {
            if (isset($validated[$section])) {
                $existing = SiteSetting::query()->where('key', $section)->first();
                $current = is_array($existing?->value) ? $existing->value : [];
                $merged = array_replace($current, $validated[$section]);
                SiteSetting::updateOrCreate(
                    ['key' => $section],
                    ['value' => $merged, 'is_public' => true]
                );
            }
        }

        return $this->show();
    }

    public function heroMedia(): JsonResponse
    {
        $record = SiteSetting::query()->where('key', 'hero_media')->first();
        $value = $record?->value;
        $data = is_array($value) ? $value : [
            'active_media_type' => 'image',
            'image_path' => '',
            'video_path' => '',
            'animation_path' => '',
        ];

        return response()->json(['success' => true] + $data);
    }

    public function updateHeroMedia(Request $request): JsonResponse
    {
        $this->authorizeSettingsManagement($request);
        $validated = $request->validate([
            'active_media_type' => ['required', 'in:image,video,animation'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'video_url' => ['nullable', 'string', 'max:2048'],
            'animation_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $data = [
            'active_media_type' => $validated['active_media_type'],
            'image_path' => $validated['image_url'] ?? '',
            'video_path' => $validated['video_url'] ?? '',
            'animation_path' => $validated['animation_url'] ?? '',
        ];

        SiteSetting::updateOrCreate(
            ['key' => 'hero_media'],
            ['value' => $data, 'is_public' => true]
        );

        return response()->json(['success' => true] + $data);
    }

    private function authorizeSettingsManagement(Request $request): void
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->isActive()
            && ($user->role === 'super_admin' || $user->hasPermissionTo('manage_settings')), 403);
    }
}
