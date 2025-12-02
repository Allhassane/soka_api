<div class="modal fade" id="editModal{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier les informations {{$data->name}}</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('galerie.update',$data->id)}}" enctype="">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <label for="">Saisir le titre</label>
                            <input type="text" name="title" value="{{$data->title}}" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>

                        <div>
                            <label for="">Description</label>
                            <textarea name="description" required class="form-control form-control-user">{{$data->description}}</textarea>
                        </div>

                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier les informations</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
