<div class="main-sidebar sidebar-style-2">
    <aside id="sidebar-wrapper">

        <div class="sidebar-user">
            <div class="sidebar-user-picture">
                <img alt="image" src="{{asset('assets/img/user.png')}}">
            </div>
            <div class="sidebar-user-details">
                <div class="user-name">{{auth()->user()->name}}</div>
                <div class="user-role">{{auth()->user()->role}}</div>

            </div>
        </div>
        <ul class="sidebar-menu">
            <li class="menu-header text-center">Menu principal</li>
            <li class="dropdown active">
                <a href="{{route('pointage.dashboard')}}" class="nav-link"><i
                        data-feather="monitor"></i><span>Tableau de bord</span>
                </a>
            </li>
            @if(auth()->user()->role!='Utilisateur normal')
            <li class="dropdown">
                <a href="{{route('pointage.index')}}" class="nav-link"><i
                        data-feather="loader"></i><span>Pointages journaliers</span>
                </a>
            </li>

            <li class="dropdown">
                <a class="nav-link" href="{{route('pointage.list_employe')}}"><i data-feather="edit"></i><span>Historique des pointages</span></a>
            </li>

            <li class="dropdown">
                <a href="{{route('pointage.search')}}" class="nav-link"><i data-feather="search"></i><span>
                  Recherche avancée</span></a>
            </li>

            <li class="dropdown">
                <a href="{{route('user.list')}}" class="nav-link"><i data-feather="users"></i><span>Utilisateurs</span></a>
            </li>
              @endif

            {{-- Bouton Déconnexion visible uniquement après 17h30 --}}
        @if($canLogout)
        <li class="nav-item">
            <a href="{{ route('logout') }}" class="btn btn-danger"
               onclick="event.preventDefault(); document.getElementById('logout-form').submit();">
               Déconnexion
            </a>
        </li>
        @endif

        <form id="logout-form" action="{{ route('logout') }}" method="POST" style="display:none;">
            @csrf
        </form>



        </ul>
    </aside>
</div>
