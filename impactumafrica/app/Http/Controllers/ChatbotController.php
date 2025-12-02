<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use OpenAI\Laravel\Facades\OpenAI;

class ChatbotController extends Controller
{
    public function ask(Request $request)
    {
        $question = $request->input('question');

        // Appel à l’API OpenAI
        $response = OpenAI::chat()->create([
            'model' => 'gpt-3.5-turbo', // tu peux mettre gpt-4 si ton compte le permet
            'messages' => [
                ['role' => 'system', 'content' => "Tu es un assistant expert en changement climatique, biodiversité et solutions fondées sur la nature."],
                ['role' => 'user', 'content' => $question],
            ],
        ]);

        $answer = $response->choices[0]->message->content;

        return response()->json(['answer' => $answer]);
    }
}
