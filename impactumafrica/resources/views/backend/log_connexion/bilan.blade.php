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
                <li class="breadcrumb-item active">Bilan des pointages</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Bilan des pointages des employes</h4>
                            </div>
                            <div class="card-body">
                                <a href="{{ route('pointage.search') }}" class="btn btn-dark">Acceder à la rechercher par date</a> <br><br>

                                @if($connexions->count()>0)
                                <div class="table-responsive">
                                    <table class="table table-striped table-hover" id="tableExport" style="width:100%;">
                                        <thead>
                                        <tr>
                                            <th>Photo</th>
                                            <th>Nom et prenoms</th>
                                            <th>Email</th>
                                            <th>Total heure de travail</th>
                                            <th>Action</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        @forelse($connexions as $connexion)

                                            <tr>
                                            <td>
                                                    <img src="{{asset('assets/img/user.png')}}" alt="" width="40" height="40">
                                            </td>
                                            <td>{{ $connexion->nom_utilisateur }}</td>
                                            <td>{{ $connexion->email }}</td>
                                            <td>{{ $connexion->total_heures_travail }}</td>
                                            <td>
                                                <a href="{{ route('pointage.show',$connexion->id) }}" class="btn btn-success">Detail des connexions</a>
                                            </td>

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
