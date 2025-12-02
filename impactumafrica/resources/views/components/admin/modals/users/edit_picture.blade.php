<div class="modal fade" id="editModalPicture{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier les photos du domaine d'activité {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('domaine.updatePicture',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le nom du domaine d'activité</label>
                            <input type="text" name="title" value="{{$data->title}}" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" readonly><br>
                        </div>
                        <div class="">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir une seconde image</label>
                            <input type="file" name="picture2" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="">
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier les photos</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
