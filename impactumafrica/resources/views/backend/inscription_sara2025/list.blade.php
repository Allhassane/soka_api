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
                <li class="breadcrumb-item active">Liste des visiteurs du SARA 2025</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des visiteurs</h4>
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
                                            <th>Entreprise</th>
                                            <th>Lieu de provenance</th>
                                            <th>Secteur activité</th>
                                            <th>Site web</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        @foreach($datas as $data)
                                            <tr>
                                                <td>{{$data->id}}</td>
                                                <td>{{$data->name}}</td>
                                                <td>{{$data->email}}</td>
                                                <td>{{$data->contact}}</td>
                                                <td>{{$data->entreprise}}</td>
                                                <td>{{$data->lieu_provenance}}</td>
                                                <td>{{$data->secteur_activite}}</td>
                                                <td>{{$data->url_site_web}}</td>
                                                <td>{{$data->created_at}}</td>
                                                <td>
                                                    <button type="button" class="btn btn-danger" data-bs-toggle="modal"
                                                            data-bs-target="#basicModal{{$data->id}}"><i class="fas fa-trash"></i> Supprimer</button>
                                                    </td>
                                            </tr>
                                        @endforeach
                                        </tbody>
                                    </table>
                                </div>
                                @else
                                    <h6 class="text-center">Aucun visiteur trouvé</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        @foreach($datas as $data)
            @include('components.admin.modals.visiteurs_sara2025.delete')
        @endforeach
    </div>

@endsection
