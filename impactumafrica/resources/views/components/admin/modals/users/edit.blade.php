<div class="modal fade" id="editModal{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier l'utilisateur {{$data->name}}</h5>
            </div>
            <div class="modal-body">
                <form class="" method="post" action="{{route('user.update',$data->id)}}">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le nom</label>
                            <input type="text" name="name" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->name}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Saisir l'adresse email</label>
                            <input type="email" name="email" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->email}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir un mot de passe</label>
                            <input type="password" name="password" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value=""><br>
                        </div>
                        <div class="">
                            <label for="">Confirmer le mot de passe</label>
                            <input type="password" name="password_confirmation" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="">
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier l'utilisateur</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
