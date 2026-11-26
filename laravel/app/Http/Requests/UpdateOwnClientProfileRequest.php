<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOwnClientProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'full_name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:1000'],
            // Explicitly prohibit restricted account & RBAC attributes
            'role' => ['prohibited'],
            'account_status' => ['prohibited'],
            'client_id' => ['prohibited'],
            'client_code' => ['prohibited'],
            'permissions' => ['prohibited'],
            'user_id' => ['prohibited'],
            'is_active' => ['prohibited'],
            'email' => ['prohibited'],
        ];
    }
}
