<header class="main-header-two">
    <div class="main-header-two__inner">
        <div class="main-header-two__top">
            <div class="container-fluid">
                <div class="main-header-two__top-inner">
                    <div class="main-header-two__logo"></div>
                    <div class="main-header-two__top-left">
                        <ul class="list-unstyled main-header-two__contact-list">
                            <li>
                                <div class="icon">
                                    <i class="icon-email"></i>
                                </div>
                                <div class="text">
                                    <p><a href="mailto:contact@impactum.africa">contact@impactum.africa</a></p>
                                </div>
                            </li>
                            <li>
                                <div class="icon">
                                    <i class="icon-pin"></i>
                                </div>
                                <div class="text">
                                    <p>{{ __('menu.info_localisation') }}</p>
                                </div>
                            </li>
                            <li>
                                <div class="icon">
                                    <i class="fas fa-phone-alt"></i>
                                </div>
                                <div class="text">
                                    <p><a href="tel:+2252722243104">+225 2722243104 / 0758683731</a></p>
                                </div>
                            </li>
                            <li>
                                <div class="icon">
                                    <i class="fas fa-user"></i>
                                </div>
                                <div class="text mr-3">
                                    <p>{{ $nombreVisiteursActifs }} {{ __('menu.stat_visite') }} {{$nombreVisiteursAujourdHui}}  {{ __('menu.stat_visite_jour') }}</p>
                                </div>
                            </li>
                           
                            <li>
                            <a href="{{ route('lang.switch','fr') }}" class="text-white"><img src="{{ asset('assets/img/fr.png') }}" alt=""></a> 
                            </li>
                            <li>
                            <a href="{{ route('lang.switch','en') }}" class="text-white"><img src="{{ asset('assets/img/en.png') }}" alt=""></a>
                            </li>
</div>

                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <div class="main-header-two__bottom">
            <nav class="main-menu main-menu-two">
                <div class="main-menu-two__wrapper">
                    <div class="container-fluid">
                        <div class="main-menu-two__wrapper-inner">
                            <div class="main-menu-two__left">
                                <div class="main-menu-two__main-menu-box">
                                    <a href="#" class="mobile-nav__toggler"><i class="fa fa-bars"></i></a>
                                    <center>
                                        <ul class="main-menu__list">
                                            <li><a href="{{route('index')}}"><img src="{{asset('assets/img/small_logo_officiel.png')}}" alt=""></a></li>
                                            <li><a href="{{route('index')}}">{{ __('menu.menu_accueil') }}</a></li>
                                            <li><a href="{{route('about.index')}}">{{ __(key: 'menu.menu_presentation') }}</a></li>
                                            <li><a href="{{route('domaine.index')}}">{{ __('menu.menu_expertise') }}</a></li>
                                            <li class="dropdown">
                                                <a href="#">{{ __('menu.menu_projet') }}</a>
                                                <ul class="shadow-box">
                                                    <li><a href="{{route('projet.en_cours')}}">{{ __('menu.menu_projet_encours') }}</a></li>
                                                    <li><a href="{{route('projet.index')}}">{{ __('menu.menu_projet_realise') }}</a></li>
                                                </ul>
                                            </li>
                                            <li><a href="{{route('etude.index')}}">{{ __('menu.menu_etude') }}</a></li>
                                            
                                            <li><a href="{{route('actualite.index')}}">{{ __('menu.menu_actualite') }}
                                            @if($nombreActualites > 0)
            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-success flash-rapide">
                {{ $nombreActualites }}
            </span>
        @endif
        </a></li>
                                            <li><a href="{{route('recrutement.index')}}">{{ __('menu.menu_recrutement') }}
                                            @if($nombreRecrutements > 0)
                                                        <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-success flash-rapide">
                                                            {{ $nombreRecrutements }}
                                                        </span>
                                                    @endif
                                            </a></li>
                                            <li class="dropdown">
                                                <a href="#">{{ __('menu.menu_mediatheque') }}</a>
                                                <ul class="shadow-box">
                                                    <li><a href="{{route('galerie.index')}}">{{ __('menu.menu_photo') }}</a></li>
                                                    <li><a href="{{route('video.index')}}">{{ __('menu.menu_video') }}</a></li>
                                                </ul>
                                            </li>
                                            <li><a href="{{route('contact.index')}}">{{ __('menu.menu_contact') }} </a></li>
                                        
                                        </ul>
                                        
                                    </center>

                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </nav>
        </div>
    </div>
</header>
