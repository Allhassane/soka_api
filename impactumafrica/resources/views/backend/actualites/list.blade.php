@extends('layouts.backend_app')

@section('content')
    <div class="main-content">
        <section class="section">
            <ul class="breadcrumb breadcrumb-style ">
                <li class="breadcrumb-item">
                    <h4 class="page-title m-b-0">Tableau de bord</h4>
                </li>
                <li class="breadcrumb-item">
                    <a href="{{route('dashboard')}}">
                        <i data-feather="home"></i></a>
                </li>
                <li class="breadcrumb-item active">Liste des actualités</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des actualités</h4>
                            </div>
                            <div class="card-body">
                                <a href="{{route('actualite.create')}}" class="btn btn-primary"> <i
                                        class="fas fa-plus fa-sm text-white-50"></i> Ajouter une actualité</a>
                                <br><br>

                                @if($datas->count()>0)
                                <div class="table-responsive">
                                    <table class="table table-striped table-hover" id="" style="width:100%;">
                                        <thead>
                                        <tr>
                                            <th>N°</th>
                                            <th>Titre</th>
                                            <th>Date</th>
                                            <th>Lien</th>
                                            <th>Image</th>
                                            <th>Date publication</th>
                                            <th>Actions</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        @foreach($datas as $data)
                                            <tr>
                                                <td>{{$data->id}}</td>
                                                <td>{{$data->title}}</td>
                                                <td>{{$data->date_actualite}}</td>
                                                <td>{{$data->link}}</td>
                                                <td>
                                                    <img src="{{asset('assets/img/actualites')}}/{{$data->picture}}" width="100" height="100" alt=""><br>
                                                    <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                                                            data-bs-target="#editModalPicture{{$data->id}}"><i class="far fa-edit"></i> Editer</button>
                                                </td>
                                                <td>{{$data->created_at}}</td>
                                                <td>
                                                    <a href="{{route('actualite.edit',$data->id)}}" class="btn btn-warning">Editer</a>
                                                    <button type="button" class="btn btn-danger" data-bs-toggle="modal"
                                                            data-bs-target="#basicModal{{$data->id}}"><i class="fas fa-trash"></i> Supprimer</button>
                                                </td>
                                            </tr>
                                        @endforeach
                                        </tbody>
                                    </table>
                                </div>
                                @else
                                    <h6 class="text-center">Aucune actualité trouvé</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.actualites.delete')
            @include('components.admin.modals.actualites.edit_picture')
        @endforeach
        @include('components.admin.modals.actualites.create')
    </div>

@endsection
