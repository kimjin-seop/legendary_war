<?php

use Illuminate\Support\Facades\Route;

// SPA 진입: /api 경로를 제외한 모든 경로를 Blade로 전달 (vue-router history 모드)
Route::get('/{any?}', fn () => view('welcome'))->where('any', '^(?!(api|sanctum)(/|$)).*$');
