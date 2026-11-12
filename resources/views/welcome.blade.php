<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>레전드리 워</title>
    <meta name="description" content="레전드리 워 (LEGENDARY WAR)">
    <meta name="theme-color" content="#0B1328">
    <link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon_32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/brand/favicon_16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/brand/app_icon_180.png">
    <meta property="og:type" content="website">
    <meta property="og:title" content="레전드리 워">
    <meta property="og:url" content="{{ url('/') }}">
    <meta property="og:image" content="{{ url('/assets/brand/og_image.jpg') }}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="{{ url('/assets/brand/og_image.jpg') }}">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <div id="app"></div>
</body>
</html>
