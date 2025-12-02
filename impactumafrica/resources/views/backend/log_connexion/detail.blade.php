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
                <li class="breadcrumb-item active">Liste des pointages par utilisateur</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Liste des pointages de l'utilisateur {{ $user->user->name }}</h4>
                            </div>
                            <div class="card-body">

                                @if($datas->count()>0)
                                <div class="table-responsive">
                                    <table class="table table-striped table-hover" id="tableExport" style="width:100%;">
                                        <thead>
                                        <tr>
                                            <th>Photo</th>
                                            <th>Nom</th>
                                            <th>Date</th>
                                            <th>Heure d'arrivée</th>
                                            <th>Heure de départ</th>
                                            <th>Appareil</th>
                                            <th>Navigateur</th>
                                            <th>Motif de deconnéxion</th>

                                        </tr>
                                        </thead>
                                        <tbody>
                                        @foreach($datas as $data)

                                            <tr>
                                                <td>

                                                        <img src="{{asset('assets/img/user.png')}}" alt="" width="40" height="40">
                                                </td>
                                                <td>{{$data->user->name}}</td>
                                                <td>{{$data->login_date->format('Y-m-d')}}</td>
                                                <td>{{$data->login_time}}</td>
                                                <td>{{$data->logout_time}}</td>
                                                <td>{{$data->device}}</td>
                                                <td>{{ $data->browser }}</td>
                                                <td>{{ $data->motif_deconnexion ?? 'RAS' }}</td>


                                            </tr>
                                        @endforeach
                                        </tbody>
                                    </table>

                                </div>
                                @else
                                    <h6 class="text-center">Aucun utilisateur présent</h6>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

    </div>


@endsection
