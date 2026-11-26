<?php

namespace App\Http\Requests;

use App\Models\Project;
use App\Support\ProjectAssignmentRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'client_id' => ['required', 'integer', ProjectAssignmentRules::assignableClient()],
            'name' => ['required', 'string', 'max:255'],
            'service_category' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:5000'],
            'start_date' => ['nullable', 'date'],
            'expected_completion_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'string', Rule::in(Project::STATUSES)],
            'priority' => ['sometimes', 'string', Rule::in(Project::PRIORITIES)],
            'progress_percentage' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'assigned_team_member_id' => ['nullable', 'integer', ProjectAssignmentRules::activeTeamMember()],
            'project_code' => ['prohibited'],
        ];
    }
}
