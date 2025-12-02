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
            <li class="breadcrumb-item active">Liste des pointages du jour</li>
        </ul>
        <div class="section-body">
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h4>Liste des pointages du jour</h4>
                        </div>
                        <div class="card-body">
                            @if($datas->count() > 0)
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
                                    </tr>
                                    </thead>
                                    <tbody>
                                    @foreach($datas as $data)
                                        <tr>
                                            <td><img src="{{asset('assets/img/user.png')}}" alt="" width="40" height="40"></td>
                                            <td>{{$data->user->name}}</td>
                                            <td>{{$data->login_date->format('Y-m-d')}}</td>
                                            <td>{{$data->login_time}}</td>
                                            <td>{{$data->logout_time}}</td>
                                            <td>{{$data->device}}</td>
                                            <td>{{ $data->browser }}</td>
                                        </tr>
                                    @endforeach
                                    </tbody>
                                </table>
                                <hr>
                                <h5>Carte des connexions</h5>
                                <div id="map" style="height:500px; width:100%;"></div>
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

<script>
document.addEventListener("DOMContentLoaded", function() {
    const map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributeurs'
    }).addTo(map);

    const markers = L.markerClusterGroup();
    const userMarkers = {}; // Stocke les markers par utilisateur

    function updateMarkers(locations) {
        locations.forEach(loc => {
            // Marker bleu = connexion (fixe)
            if(!userMarkers[loc.user]) {
                const loginMarker = L.marker([loc.login_lat, loc.login_lon], {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                    })
                }).bindPopup(`<b>${loc.user}</b><br>Connexion: ${loc.heure_login}`);
                markers.addLayer(loginMarker);
                userMarkers[loc.user] = { login: loginMarker, logout: null };
            }

            // Marker rouge = déconnexion ou position actuelle
            const lat = loc.logout_lat || loc.login_lat;
            const lon = loc.logout_lon || loc.login_lon;
            const popupText = `<b>${loc.user}</b><br>Déconnexion: ${loc.heure_logout}`;

            if(userMarkers[loc.user].logout) {
                // Déplacer le marker existant
                userMarkers[loc.user].logout.setLatLng([lat, lon]).bindPopup(popupText);
            } else {
                const logoutMarker = L.marker([lat, lon], {
                    icon: L.icon({
                        iconUrl: 'https://cdn-icons-png.flaticon.com/512/190/190406.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                    })
                }).bindPopup(popupText);
                markers.addLayer(logoutMarker);
                userMarkers[loc.user].logout = logoutMarker;
            }
        });
    }

    map.addLayer(markers);

    // Première récupération
    fetchPositions();

    // Actualisation toutes les 5 secondes
    setInterval(fetchPositions, 5000);

    function fetchPositions() {
        fetch("{{ route('api.positions') }}")
            .then(response => response.json())
            .then(data => updateMarkers(data));
    }
});
</script>

@endsection
