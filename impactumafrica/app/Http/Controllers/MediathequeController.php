<?php

namespace App\Http\Controllers;

use App\Models\Actualite;
use App\Models\Photo;
use App\Models\Video;
use Illuminate\Http\Request;

class MediathequeController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function indexPhoto()
    {
        $photos = Actualite::whereNotIn('id', [4,5,6,8, 10,12, 13, 16,18])->orderBy('id', 'desc')->get();
        //dd($photos);
        return view('front_end.galerie_photo', compact('photos'));
    }

    public function indexVideo()
    {
        $videos = Video::orderBy('id', 'desc')->get();
        return view('front_end.galerie_video', compact('videos'));
    }

    public function listPhoto()
    {
        $datas = Photo::orderBy('id', 'desc')->get();
        return view('backend.photos.list', compact('datas'));
    }

    public function listVideo()
    {
        $datas = Video::orderBy('id', 'desc')->get();
        return view('backend.videos.list', compact('datas'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function storePhoto(Request $request)
    {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/mediatheque/photos', $imageName);

            Photo::create(
                [
                    'title' => $request->title,
                    'description' => $request->description,
                    'picture'=>$imageName,
                ]
            );
            return redirect()->back()->with('success','Photo ajoutée avec succes.');

    }

    public function storeVideo(Request $request)
    {
        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/mediatheque/videos', $imageName);

        Video::create(
            [
                'title' => $request->title,
                'url' => $request->url,
                'description' => $request->description,
            ]
        );
        return redirect()->back()->with('success','Video ajoutée avec succes.');
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(string $id)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function updatePhoto(Request $request, string $id)
    {
        $data = Photo::findOrFail($id);
        $data->title = $request->title;
        $data->description = $request->description;
        $data->update();
        return redirect()->back()->with('success','Information de photo modifiée avec succes.');
    }

    public function updateVideo(Request $request, string $id)
    {
        $data = Video::findOrFail($id);
        $data->title = $request->title;
        $data->description = $request->description;
        $data->url = $request->url;
        $data->update();
        return redirect()->back()->with('success','Information de video modifiée avec succes.');
    }

    public function updatePicturePhoto(Request $request, string $id)
    {
        $data = Photo::findOrFail($id);
        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/mediatheque/photos', $imageName);

        $data->picture = $imageName;
        $data->update();
        return redirect()->back()->with('success','Photo modifiée avec succes.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroyPhoto(Photo $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Photo supprimée de la galerie avec succes .');
    }

    public function destroyVideo(Video $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Video supprimée de la galerie avec succes .');
    }

}
