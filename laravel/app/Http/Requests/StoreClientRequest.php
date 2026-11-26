<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClientRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'full_name' => is_string($this->input('full_name')) ? trim($this->input('full_name')) : $this->input('full_name'),
            'email' => is_string($this->input('email')) ? mb_strtolower(trim($this->input('email'))) : $this->input('email'),
        ]);
    }

    public function authorize(): bool
    {
        // Actual permission is checked by ClientPolicy in the controller.
        return true;
    }

    public function rules(): array
    {
        return [
            'full_name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'email:rfc',
                'max:255',
                Rule::unique('clients', 'email'),
                Rule::unique('users', 'email'),
            ],
            'phone' => ['nullable', 'string', 'max:50'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:1000'],
            'service_ids' => ['nullable', 'array'],
            'service_ids.*' => [
                'integer',
                'distinct',
                Rule::exists('services', 'id')->where(fn ($query) => $query->where('is_active', true)),
            ],
            'send_invitation' => ['sometimes', 'boolean'],
            'role' => ['prohibited'],
            'permissions' => ['prohibited'],
            'password' => ['prohibited'],
            'client_code' => ['prohibited'],
            'user_id' => ['prohibited'],
            'account_status' => ['prohibited'],
            'is_active' => ['prohibited'],
        ];
    }
}
