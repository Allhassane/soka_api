<div class="modal fade" id="basicModal{{$data->id}}" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel"
     aria-hidden="true">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="exampleModalLabel">Suppression des données</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <h5>Cette action est irreversible</h5>
                Vouler vous supprimer le slider {{$data->title}} ?
            </div>
            <div class="modal-footer br">
                <a href="{{route('slider.delete',$data->id)}}" class="btn btn-success">Supprimer</a>
                <button type="button" class="btn btn-danger" data-dismiss="modal">Annuler</button>
            </div>
        </div>
    </div>
</div>
