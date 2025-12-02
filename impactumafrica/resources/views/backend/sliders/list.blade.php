@extends('layouts.backend_app')

@section('content')

    <div class="main-content">
        <section class="section">
            <ul class="breadcrumb breadcrumb-style ">
                <li class="breadcrumb-item">
                    <h4 class="page-title m-b-0">Tableau de bord</h4>
                </li>
                <li class="breadcrumb-item">
                    <a href="{{route('home')}}">
                        <i data-feather="home"></i></a>
                </li>
                <li class="breadcrumb-item active">Liste des images defilantes</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des images defilantes</h4>
                            </div>
                            <div class="card-body">
                                <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                                        data-bs-target="#addModal"> <i
                                        class="fas fa-plus fa-sm text-white-50"></i> Ajouter une image defilante</button>
                                <br><br>

                                @if($datas->count()>0)
                                    <div class="table-responsive">
                                        <table class="table table-striped table-hover" id="" style="width:100%;">
                                            <thead>
                                            <tr>
                                                <th>Titre</th>
                                                <th>Image</th>
                                                <th>Actions</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            @foreach($datas as $data)
                                                <tr>
                                                    <td>{{$data->title}}</td>
                                                    <td><img src="{{asset('assets/img/sliders')}}/{{$data->picture}}" width="100" height="100" alt=""></td>
                                                    <td>
                                                        <button type="button" class="btn btn-danger" data-bs-toggle="modal"
                                                                data-bs-target="#basicModal{{$data->id}}"><i class="fas fa-trash"></i> Supprimer</button>
                                                        <button type="button" class="btn btn-warning" data-bs-toggle="modal"
                                                                data-bs-target="#editModalPicture{{$data->id}}"><i class="far fa-edit"></i> Editer les photos</button>
                                                    </td>
                                                </tr>
                                            @endforeach
                                            </tbody>
                                        </table>
                                    </div>
                                @else
                                    <h6 class="text-center">Aucune image defilante trouvée</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.sliders.delete')
            @include('components.admin.modals.sliders.edit_picture')
        @endforeach
        @include('components.admin.modals.sliders.create')
    </div>

@endsection
