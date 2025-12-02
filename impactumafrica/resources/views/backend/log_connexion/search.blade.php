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
                <li class="breadcrumb-item active">Bilan des pointages des employes</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Formulaire de recherche par date</h4>
                            </div>
                            <div class="card-body">
                                <form class="user" method="post" action="{{route('pointage.get_search')}}">
                                    @csrf
                                    <div class="form-group row">

                                        <div class="col-4">
                                            <label for="">Choisir la date de debut</label>
                                            <input type="date" name="date_debut" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('date_debut')}}" required>
                                        </div>
                                        <div class="col-4">
                                            <label for="">Choisir la date de fin</label>
                                            <input type="date" name="date_fin" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('date_fin')}}" required>
                                        </div>
                                        <div class="col-4">
                                            <label for=""></label><br>
                                            <button type="submit" class="btn btn-primary btn-user ">Rechercher les informations</button>
                                        </div>

                                    </div>

                                </form>
                                @if(isset($date_debut) && isset($date_fin))
                                <h5 class="text-success">Résultats de la recherche du {{ $date_debut }} au {{ $date_fin }}</h5>
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
                                        @foreach($connexions as $connexion)

                                            <tr>
                                            <td>
                                                    <img src="{{asset('assets/img/user.png')}}" alt="" width="40" height="40">
                                            </td>
                                            <td>{{ $connexion->nom_utilisateur }}</td>
                                            <td>{{ $connexion->email }}</td>
                                            <td>{{ $connexion->total_heures_travail }}</td>
                                            <td>
                                                <a href="{{ route('pointage.show_periode', [
                                                    'id' => $connexion->id,
                                                    'debut' => $date_debut,
                                                    'fin' => $date_fin
                                                    ]) }}" class="btn btn-success">
                                                    Détail des connexions
                                                </a>
                                            </td>

                                            </tr>
                                        @endforeach
                                        </tbody>
                                    </table>
                                </div>
                                @else
                                    <h6 class="text-center">Aucun utilisateur trouvé durant la période selectionnée</h6>
                                @endif
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

    </div>

@endsection
