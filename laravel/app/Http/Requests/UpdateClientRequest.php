<?php

namespace App\Http\Requests;

use App\Models\Client;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClientRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('full_name'))) {
            $this->merge(['full_name' => trim($this->input('full_name'))]);
        }
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    public function authorize(): bool
    {
        // Actual record and operation authorization is checked by ClientPolicy.
        return true;
    }

    public function rules(): array
    {
        /** @var Client|null $client */
        $client = $this->route('client');
        $clientId = $client?->id;
        $userId = $client?->user_id;

        return [
            'full_name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes',
                'required',
                'string',
                'email:rfc',
                'max:255',
                Rule::unique('clients', 'email')->ignore($clientId),
                Rule::unique('users', 'email')->ignore($userId),
            ],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'company_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'service_ids' => ['sometimes', 'array'],
            'service_ids.*' => ['integer', 'distinct', Rule::exists('services', 'id')],
            'role' => ['prohibited'],
            'permissions' => ['prohibited'],
            'password' => ['prohibited'],
            'client_code' => ['prohibited'],
            'user_id' => ['prohibited'],
            'account_status' => ['prohibited'],
            'is_active' => ['prohibited'],
            'invited_at' => ['prohibited'],
            'activated_at' => ['prohibited'],
            'suspended_at' => ['prohibited'],
        ];
    }
}
