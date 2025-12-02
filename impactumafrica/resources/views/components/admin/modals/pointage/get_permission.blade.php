<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="formModal"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title text-center" id="formModal">Motif de départ</h5>
            </div>
            <div class="modal-body">
                <form class="user" method="post" action="{{route('pointage.get_permission')}}">
                    @csrf
                    <div class="form-group row">
                        <div class="">
                            <input type="text" class="form-control form-control-user" name="motif_deconnexion" required /><br>
                        </div>

                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer le motif de départ</button>
                        <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
                    </center>
                </form>
            </div>
        </div>
    </div>
</div>
