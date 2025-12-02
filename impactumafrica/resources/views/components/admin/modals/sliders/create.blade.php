<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Enregistrer une image defilante</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('slider.store')}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <label for="">Saisir le titre</label>
                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="" required><br>
                        </div>
                        <div class="">
                            <label for="">Choisir le service rattaché</label>
                            <select name="service_id" id="" class="form-control" required>
                                @foreach($domaines as $domaine)
                                    <option value="{{$domaine->id}}">{{$domaine->title}}</option>
                                @endforeach
                            </select>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer une image defilante</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
