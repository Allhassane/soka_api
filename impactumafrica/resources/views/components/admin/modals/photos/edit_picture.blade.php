<div class="modal fade" id="editModalPicture{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier la photo {{$data->name}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('galerie.updatePicture',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <img src="{{asset('assets/img/mediatheque/photos')}}/{{$data->picture}}" width="100px" height="100px" alt="">
                            <label for="">Choisir une image (373*370)</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier la photo</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
