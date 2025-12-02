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
                <li class="breadcrumb-item active">Liste des projets</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des projets</h4>
                            </div>
                            <div class="card-body">
                                <div class="d-flex">
                                    <a href="{{route('projet.create')}}" class="btn btn-primary"><i
                                            class="fas fa-plus fa-sm text-white-50"></i> Ajouter un projet</a>
                                </div>
                                <br><br>

                                @if($datas->count()>0)
                                    <div class="table-responsive">
                                        <table class="table table-striped table-hover" id="" style="width:100%;">
                                            <thead>
                                            <tr>
                                                <th>N°</th>
                                                <th>Titre</th>
                                                <th>Bailleur</th>
                                                <th>Zone</th>
                                                <th>Date Projet</th>
                                                <th>Image</th>
                                                <th>Actions</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            @foreach($datas as $data)
                                                <tr>
                                                    <td>{{$data->id}}</td>
                                                    <td>
                                                        {{$data->title}} <br>
                                                        <a href="{{route('projet.create_commentaire',$data->id)}}" class="btn btn-primary">Ajouter ou modifier un resumé</a>
                                                    </td>
                                                    <td>{{$data->bailleur}}</td>
                                                    <td>{{$data->zone}}</td>
                                                    <td>{{$data->date_projet}}</td>
                                                    <td>
                                                        <img src="{{asset('assets/img/projets')}}/{{$data->picture}}" width="50" height="50" alt=""><br>
                                                        <button type="button" class="btn btn-info" data-bs-toggle="modal"
                                                                data-bs-target="#editModalPicture{{$data->id}}"><i class="far fa-edit"></i> Editer</button>
                                                    </td>
                                                    <td>
                                                        <a href="{{route('projet.edit',$data->id)}}" class="btn btn-primary">
                                                            <i class="far fa-edit"></i> </a>
                                                        <button type="button" class="btn btn-danger" data-bs-toggle="modal"
                                                                data-bs-target="#basicModal{{$data->id}}"><i class="fas fa-trash"></i></button>
                                                        </td>
                                                </tr>
                                            @endforeach
                                            </tbody>
                                        </table>
                                    </div>
                                @else
                                    <h6 class="text-center">Aucun projet trouvé</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.projets.delete')
            @include('components.admin.modals.projets.edit_picture')
        @endforeach
    </div>
@endsection
