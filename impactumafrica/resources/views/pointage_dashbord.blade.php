@extends('layouts.backend_app')
@section('content')
    <!-- Main Content -->
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
                <li class="breadcrumb-item active">Accueil</li>
            </ul>
            @if(auth()->user()->role!='Utilisateur normal')
            <div class="row ">
                <div class="col-xl-3 col-lg-6 col-md-6 col-sm-6 col-xs-12">
                    <div class="card">
                        <div class="card-statistic-4">
                            <div class="align-items-center justify-content-between">
                                <div class="row ">
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pr-0 pt-3">
                                        <div class="card-content">
                                            <h5 class="font-15">Les présences du jour</h5>
                                            <h2 class="mb-3 font-18">{{ $user_online }}</h2>
                                            <center>
                                                <a href="{{ route('pointage.index') }}" class="btn btn-icon icon-left btn-primary"><i class="far fa-list-alt"></i> Voir </a>
                                            </center>
                                        </div>
                                    </div>
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pl-0">
                                        <div class="banner-img">
                                            <img src="{{asset('admin/assets/img/action.png')}}" alt="">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-xl-3 col-lg-6 col-md-6 col-sm-6 col-xs-12">
                    <div class="card">
                        <div class="card-statistic-4">
                            <div class="align-items-center justify-content-between">
                                <div class="row ">
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pr-0 pt-3">
                                        <div class="card-content">
                                            <h5 class="font-15">Historique des pointages</h5>
                                            <h2 class="mb-3 font-18">*</h2>
                                            <center>
                                                <a href="{{ route('pointage.list_employe') }}" class="btn btn-icon icon-left btn-primary"><i class="far fa-list-alt"></i> Voir </a>
                                            </center>
                                        </div>
                                    </div>
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pl-0">
                                        <div class="banner-img">
                                            <img src="{{asset('admin/assets/img/book.png')}}" alt="">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-xl-3 col-lg-6 col-md-6 col-sm-6 col-xs-12">
                    <div class="card">
                        <div class="card-statistic-4">
                            <div class="align-items-center justify-content-between">
                                <div class="row ">
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pr-0 pt-3">
                                        <div class="card-content">
                                            <h5 class="font-15">Recherche avancée</h5>
                                            <h2 class="mb-3 font-18">*</h2>
                                            <center>
                                                <a href="{{ route('pointage.search') }}" class="btn btn-icon icon-left btn-primary"><i class="far fa-list-alt"></i> Voir </a>
                                            </center>
                                        </div>
                                    </div>
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pl-0">
                                        <div class="banner-img">
                                            <img src="{{asset('admin/assets/img/projet.png')}}" alt="">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-xl-3 col-lg-6 col-md-6 col-sm-6 col-xs-12">
                    <div class="card">
                        <div class="card-statistic-4">
                            <div class="align-items-center justify-content-between">
                                <div class="row ">
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pr-0 pt-3">
                                        <div class="card-content">
                                            <h5 class="font-15">Gestion des utilisateurs</h5>
                                            <h2 class="mb-3 font-18">{{ $employes }}</h2>
                                            <center>
                                                <a href="{{ route('user.list') }}" class="btn btn-icon icon-left btn-primary"><i class="far fa-list-alt"></i> Voir </a>
                                            </center>
                                        </div>
                                    </div>
                                    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-6 pl-0">
                                        <div class="banner-img">
                                            <img src="{{asset('assets/img/user.png')}}" alt="">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            @else
            <div class="row">
                <h3 class="text-center"> Bienvenue {{ auth()->user()->name }} </h3><br>
                <div class="col-3"></div>
                <div class="col-6">
                    @if($canLogout)
                    @include('components.admin.logout_form')
                    @else
                        <p class="text-muted text-danger">Vous pourrez vous déconnecter à partir de 17h30.</p>
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal"
                                        data-bs-target="#addModal"> <i
                                        class="fas fa-plus fa-sm text-white-50"></i> Demander une permission</button>
                                <br><br>

                    @endif

                </div>
                <div class="col-3"></div>
            </div>
            @endif

        </section>
                    @include('components.admin.modals.pointage.get_permission')

    </div>
@endsection


@if(session('success'))
    <div class="alert alert-success">
        {{ session('success') }}
    </div>

    @if(session('logout'))
        <script>
            // Déconnexion après 2 secondes
            setTimeout(function() {
                // On envoie une requête POST vers la route logout
                fetch("{{ route('logout') }}", {
                    method: "POST",
                    headers: {
                        "X-CSRF-TOKEN": "{{ csrf_token() }}",
                        "Content-Type": "application/json"
                    },
                }).then(() => {
                    // Redirection vers la page de login après logout
                    window.location.href = "{{ route('pointage.auth') }}";
                });
            }, 2000); // 2000ms = 2 secondes
        </script>
    @endif
@endif
