<?php

namespace App\Http\Requests;

use App\Models\Project;
use App\Support\ProjectAssignmentRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Validator;

class UpdateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $project = $this->route('project');
            if (!$project) {
                return;
            }

            if ($validator->errors()->has('start_date') || $validator->errors()->has('expected_completion_date')) {
                return;
            }

            $startDate = $this->has('start_date')
                ? $this->input('start_date')
                : $project->start_date?->toDateString();
            $completionDate = $this->has('expected_completion_date')
                ? $this->input('expected_completion_date')
                : $project->expected_completion_date?->toDateString();

            if ($startDate && $completionDate && Carbon::parse($completionDate)->lt(Carbon::parse($startDate))) {
                $validator->errors()->add(
                    'expected_completion_date',
                    'The expected completion date must be on or after the project start date.'
                );
            }
        });
    }

    public function rules(): array
    {
        $project = $this->route('project');

        return [
            'client_id' => ['sometimes', 'required', 'integer', ProjectAssignmentRules::assignableClientForUpdate($project?->client_id)],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'service_category' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:5000'],
            'start_date' => ['nullable', 'date'],
            'expected_completion_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'string', Rule::in(Project::STATUSES)],
            'priority' => ['sometimes', 'string', Rule::in(Project::PRIORITIES)],
            'progress_percentage' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'assigned_team_member_id' => ['nullable', 'integer', ProjectAssignmentRules::activeTeamMemberForUpdate($project?->assigned_team_member_id)],
            'project_code' => ['prohibited'],
        ];
    }
}
