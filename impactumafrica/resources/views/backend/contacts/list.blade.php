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
                <li class="breadcrumb-item active">Liste des messages de contact</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des messages de contact</h4>
                            </div>
                            <div class="card-body">
                                @if($datas->count()>0)
                                    <div class="table-responsive">
                                        <table class="table table-striped table-hover" id="tableExport" style="width:100%;">
                                            <thead>
                                            <tr>
                                                <th>N°</th>
                                                <th>Nom</th>
                                                <th>Email</th>
                                                <th>Contact</th>
                                                <th>Sujet</th>
                                                <th>Message</th>
{{--                                                <th>Statut</th>--}}
                                                <th>Date</th>
                                                <th>Actions</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            @foreach($datas as $data)
                                                <tr>
                                                    <td>{{$data->id}}</td>
                                                    <td>{{$data->nom}}</td>
                                                    <td>{{$data->email}}</td>
                                                    <td>{{$data->contact}}</td>
                                                    <td>{{$data->sujet}}</td>
                                                    <td>{{$data->message}}</td>
{{--                                                    <td>@if($data->statut==0)<span class="badge btn-dark"> Non lu</span> @else <span class="badge btn-success">Déja lu</span> @endif</td>--}}
                                                    <td>{{$data->created_at}}</td>
                                                    <td>
                                                        <button type="button" class="btn btn-danger" data-bs-toggle="modal"
                                                                data-bs-target="#basicModal{{$data->id}}"><i class="fas fa-trash"></i> </button>
                                                    </td>
                                                </tr>
                                            @endforeach

                                            </tbody>
                                        </table>
                                    </div>
                                @else
                                    <h6 class="text-center">Aucun message de contact trouvé</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.contacts.delete')
        @endforeach
    </div>

@endsection
