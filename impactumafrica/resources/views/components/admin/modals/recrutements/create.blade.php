<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Enregistrer une actualité</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('actualite.store')}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le titre de l'actualité</label>
                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('title')}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir la date de l'actualité</label>
                            <input type="date" name="date_actualite" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('date_actualite')}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Lien de l'actualité</label>
                            <input type="text" name="link" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{old('link')}}" required>
                        </div>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-12">
                            <label for="">Saisir la description</label>
                            <textarea name="description" required id="" cols="30" class="form-control " rows="4"></textarea>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer une actualité</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
