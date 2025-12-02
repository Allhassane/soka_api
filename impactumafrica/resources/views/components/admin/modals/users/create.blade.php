<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Enregistrer un utilisateur</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('user.store')}}">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le nom</label>
                            <input type="text" name="name" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('name')}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Saisir l'adresse email</label>
                            <input type="email" name="email" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('email')}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir un mot de passe</label>
                            <input type="password" name="password" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('password')}}"><br>
                        </div>
                        <div class="">
                            <label for="">Confirmer le mot de passe</label>
                            <input type="password" name="password_confirmation" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('password_confirmation')}}">
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer l'utilisateur</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
