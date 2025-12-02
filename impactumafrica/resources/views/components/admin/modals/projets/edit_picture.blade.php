<div class="modal fade" id="editModalPicture{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier les photos du projet {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('projet.updatePicture',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="col-12">
                            <label for="">Saisir le nom du projet</label>
                            <input type="text" name="title_court" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->title}}" readonly><br>
                        </div>
                        <div class="col-6">
                            <img src="{{asset('assets/img/projets')}}/{{$data->picture}}" width="100px" height="100px" alt="">
                            <label for="">Choisir une image de profil(410*260)</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required>
                        </div>
                        <div class="col-6">
                            <img src="{{asset('assets/img/projets')}}/{{$data->picture2}}" width="100px" height="100px" alt="">
                            <label for="">Choisir une image secondaire(image large)</label>
                            <input type="file" name="picture2" class="form-control form-control-user" id=""
                                   placeholder="" >
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier les photos du projet</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
