<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'service' => 'Laravel API backend',
    'message' => 'The frontend is served by the React/Express application.',
]));
