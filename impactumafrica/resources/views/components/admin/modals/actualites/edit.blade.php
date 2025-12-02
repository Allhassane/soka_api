<div class="modal fade" id="editModal{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier le domaine d'activité {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="" method="post" action="{{route('actualite.update',$data->id)}}" enctype="multipart/form-data">
                    @csrf

                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le titre de l'actualité</label>
                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->title}}" required><br>
                        </div>
                        <div class="">
                            <img src="{{asset('assets/img/actualites')}}/{{$data->picture}}" width="100px" height="100px" alt="">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir la date de l'actualité</label>
                            <input type="date" name="date_actualite" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->date_actualite}}" required><br>
                        </div>
                        <div class="">
                            <label for="">Lien de l'actualité</label>
                            <input type="text" name="link" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" value="{{$data->link}}" required>
                        </div>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-12">
                            <label for="">Saisir la description</label>
                            <textarea name="description" required id="" cols="30" class="form-control " rows="4">
                                {{$data->description}}
                            </textarea>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier l'actualité</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
