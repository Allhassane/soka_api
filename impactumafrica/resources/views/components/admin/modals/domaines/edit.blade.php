<div class="modal fade" id="editModal{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Modifier le domaine d'activité {{$data->title}}</h5>
            </div>
            <div class="modal-body">
                <form class="" method="post" action="{{route('domaine.update',$data->id)}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group">
                        <div class="">
                            <label for="">Saisir le nom du domaine d'activité</label>
                            <input type="text" name="title" value="{{$data->title}}" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choix du statut: {{$data->statut}}</label>
                            <select name="statut" id="" class="form-control" required>
                                <option value="Long">Long</option>
                                <option value="Court">Court</option>
                            </select><br>
                        </div>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-12">
                            <label for="">Saisir la description</label>
                            <textarea name="description" required id="" cols="30" class="form-control " rows="4">{{$data->description}}</textarea>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Modifier le domaine d'activité</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
