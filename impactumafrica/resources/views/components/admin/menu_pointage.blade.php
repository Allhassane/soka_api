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
                <a href="{{route('pointage.list_employe')}}" class="nav-link"><i
                        data-feather="loader"></i><span>Gestion des pointages</span>
                </a>
            </li>


            <li class="dropdown">
                <a class="nav-link" href=""><i data-feather="edit"></i><span>Historique des pointages</span></a>
            </li>

            <li class="dropdown">
                <a href="" class="nav-link"><i data-feather="user"></i><span>
                  Gestion du profil</span></a>
            </li>

            <li class="dropdown">
                <a href="{{route('user.list')}}" class="nav-link"><i data-feather="users"></i><span>Utilisateurs</span></a>
            </li>
                  <li>
                  <form action="{{ route('logout') }}" method="POST">
                        @csrf
                        <button type="submit" class="btn btn-danger">Deconnexion</button>
                    </form>
                  </li>


            @else
            <li class="dropdown">
                <a href="" class="nav-link"><i data-feather="dollar-sign"></i><span>
                  Gestion du profil</span></a>
            </li>
            <li class="dropdown">
                <a href="" class="nav-link"><i data-feather="power-off"></i><span>
                  Deconnexion</span></a>
            </li>
            @endif


        </ul>
    </aside>
</div>
