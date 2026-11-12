<?php

namespace App\Http\Controllers;

use App\Services\ProtagonistService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProtagonistController extends Controller
{
    public function __construct(private readonly ProtagonistService $svc)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['protagonist' => $this->svc->state($request->user())]);
    }

    /** 생성/재검사. mode=quiz(answers) | manual(class) | skip(기본 원형). gender/face 미지정 시 기존값 또는 기본값. */
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'mode' => ['required', Rule::in(['quiz', 'manual', 'skip'])],
            'gender' => ['sometimes', 'string', Rule::in((array) config('protagonist.genders'))],
            'face' => ['sometimes', 'string', 'max:16'],
            'answers' => ['required_if:mode,quiz', 'array', 'max:50'],
            'answers.*' => ['string', 'max:8'],
            'class' => ['required_if:mode,manual', 'string', 'max:16'],
        ]);

        return response()->json(['protagonist' => $this->svc->save($request->user(), $d)]);
    }

    public function face(Request $request): JsonResponse
    {
        $d = $request->validate(['face' => ['required', 'string', 'max:16']]);

        return response()->json(['protagonist' => $this->svc->changeFace($request->user(), $d['face'])]);
    }
}
