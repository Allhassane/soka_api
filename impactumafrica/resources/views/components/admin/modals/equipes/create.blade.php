<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Enregistrer un employé</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('equipe.store')}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <label for="">Saisir le nom</label>
                            <input type="text" name="name" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Saisir la fonction</label>
                            <input type="text" name="fonction" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir une image(370*270)</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer un employé</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
