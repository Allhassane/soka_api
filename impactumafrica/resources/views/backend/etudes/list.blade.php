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
                <li class="breadcrumb-item active">Liste des etudes</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des etudes</h4>
                            </div>
                            <div class="card-body">
                                <div class="d-flex">
                                    <a href="{{route('etude.create')}}" class="btn btn-primary"><i
                                            class="fas fa-plus fa-sm text-white-50"></i> Ajouter une etude</a>
                                </div>
                                <br><br>

                                @if($datas->count()>0)
                                    <div class="table-responsive">
                                        <table class="table table-striped table-hover" id="" style="width:100%;">
                                            <thead>
                                            <tr>
                                                <th>N°</th>
                                                <th>Titre</th>
                                                <th>Photo</th>
                                                <th>Actions</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            @foreach($datas as $data)
                                                <tr>
                                                    <td>{{$data->id}}</td>
                                                    <td>{{$data->title}}</td>
                                                    <td>
                                                        <img src="{{ asset('assets/img/etudes') }}/{{ $data->picture }}" width="100" height="100">
                                                        <br>
                                                        <button type="button" class="btn btn-warning" data-bs-toggle="modal"
                                                                data-bs-target="#editModalPicture{{$data->id}}"><i class="far fa-edit"></i> Editer</button>
                                                     </td>
                                                    <td>
                                                        <a href="{{route('etude.edit',$data->id)}}" class="btn btn-primary">
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
                                    <h6 class="text-center">Aucune etude trouvée</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.etudes.delete')
            @include('components.admin.modals.etudes.edit_picture')
        @endforeach
    </div>
@endsection
