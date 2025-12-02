<div class="modal fade" id="editModalPicture{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier les photos de {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('actualite.updatePicture',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Actualité</label>
                            <input type="text" name="title" value="{{$data->title}}" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" readonly><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/actualites')}}/{{$data->picture}}" width="100px" height="100px" alt="">
                            <label for="">Choisir image de profil(410*260)</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/actualites')}}/{{$data->picture3}}" width="100px" height="100px" alt="">
                            <label for="">Choisir image 3 (410*260)</label>
                            <input type="file" name="picture3" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/actualites')}}/{{$data->picture4}}" width="100px" height="100px" alt="">
                            <label for="">Choisir image 4(410*260)</label>
                            <input type="file" name="picture4" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/actualites')}}/{{$data->picture2}}" width="100px" height="100px" alt="">
                            <label for="">Choisir image de detail(1920*1076)</label>
                            <input type="file" name="picture2" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="">
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier les photos</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
