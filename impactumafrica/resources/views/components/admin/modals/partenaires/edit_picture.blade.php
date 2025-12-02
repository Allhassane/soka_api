<div class="modal fade" id="editModalPicture{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier le logo {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('partenaire.update',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <label for="">Saisir le nom</label>
                            <input type="text" name="title" value="{{$data->title}}" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/partenaires')}}/{{$data->picture}}" width="100px" height="100px" alt="">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier les informations</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
