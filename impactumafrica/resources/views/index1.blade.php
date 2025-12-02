<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | Accueil </title>
    <!-- favicons Icons -->
    <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="IMPACTUM est une Organisation Non Gouvernementale en Afrique crée en 2009 engagée dans des programmes de développement durable notamment
    dans l'implémentation des solutions basées sur la nature, le plaidoyer sur les enjeux climatiques, le développement communautaire et conseil stratégique">



    <!-- fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">

    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap"
        rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="{{asset('assets/vendors/bootstrap/css/bootstrap.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/animate/animate.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/animate/custom-animate.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/fontawesome/css/all.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jarallax/jarallax.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jquery-magnific-popup/jquery.magnific-popup.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/nouislider/nouislider.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/nouislider/nouislider.pips.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/odometer/odometer.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/swiper/swiper.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/agrion-icons/style.css')}}">
    <link rel="stylesheet" href="{{asset('assets/vendors/tiny-slider/tiny-slider.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/reey-font/stylesheet.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/owl-carousel/owl.carousel.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/owl-carousel/owl.theme.default.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/bxslider/jquery.bxslider.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/bootstrap-select/css/bootstrap-select.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/vegas/vegas.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jquery-ui/jquery-ui.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/timepicker/timePicker.css')}}" />

    <!-- template styles -->
    <link rel="stylesheet" href="{{asset('assets/css/agrion.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/css/agrion-responsive.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/css/my_style.css')}}" />
    <meta name="google-site-verification" content="wSsFK0rQ_H9bUiiy6kLVX7rsiGZ6DSOYxf0DD6WARQA" />

    <style>
        .clignote {
            animation: clignoter 5s infinite;
            color: #00a767;
            font-weight: bold;
        }

        @keyframes clignoter {
            0% { opacity: 1; }
            50% { opacity: 0; }
            100% { opacity: 1; }
        }
    </style>
</head>

<body class="custom-cursor">

    <div class="custom-cursor__cursor"></div>
    <div class="custom-cursor__cursor-two"></div>

    <div class="page-wrapper">
        @include('components.frontend.header')


        <div class="stricky-header stricked-menu main-menu main-menu-two">
            <div class="sticky-header__content"></div>
        </div>

        <!--Main Slider Two Start-->
        @include('components.frontend.slider')

        <!--Main Slider Two End-->
        <div class="container espace">
            <div class="row">
                <div class="col-1 text-success">
                    <b>{{ __('about.info') }}:</b>
                </div>
                <div class="col-11">
                    <marquee behavior="" direction="">
                        @foreach($infos as $actualite)
                            <a href="{{route('actualite.show',$actualite->id)}}" class="perso">
                            @if(session('locale') === 'fr')
                                {{ $actualite->title }}
                            @else
                                {{ $actualite->title_en }}
                            @endif
                            </a> |
                        @endforeach
                    </marquee>
                </div>
            </div>
        </div>

        <!--About Two Start-->
        <section class="about-two">
            <div class="container">
                <div class="row">
                    <div class="col-xl-5">
                        <div class="about-two__left">
                            <div class="about-two__img wow slideInLeft" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <img src="{{asset('assets/img/ta.png')}}" alt=""><br><br>
                                <div class="about-two__experience">
                                    <div class="about-two__experience-count-box">
                                        <h2 class="odometer" data-count="16">00</h2>
                                    </div>
                                    <p class="about-two__experience-text">{{ __('about.info_annee') }} <br> {{ __('about.info_experience') }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-7">
                        <div class="about-Two__right wow slideInRight" data-wow-delay="100ms"
                             data-wow-duration="2500ms">
                            <div class="section-title text-left">
                                <h3 class="section-title__title wow slideInRight" data-wow-delay="200ms"
                                    data-wow-duration="2500ms">IMPACTUM = Impact +
                                    Momentum</h3>
                            </div>
                            <p class="about-two__text wow slideInRight" data-wow-delay="300ms"
                               data-wow-duration="2500ms">{{ __('about.info_descr1') }} :</p>
                            <ul class="about-two__points list-unstyled">
                                <li></li>
                                <li>
                                    <div class="about-two__icon">
                                        <span class="fa fa-check"></span>
                                    </div>
                                    <div class="about-two__title">
                                        <h3>{{ __('about.axe1') }} </h3>
                                    </div>
                                </li>
                                <li>
                                    <div class="about-two__icon">
                                        <span class="fa fa-check"></span>
                                    </div>
                                    <div class="about-two__title">
                                        <h3>{{ __('about.axe2') }} </h3>
                                    </div>
                                </li>
                                <li>
                                    <div class="about-two__icon">
                                        <span class="fa fa-check"></span>
                                    </div>
                                    <div class="about-two__title">
                                        <h3>{{ __('about.axe3') }} </h3>
                                    </div>
                                </li>
                                <li>
                                    <div class="about-two__icon">
                                        <span class="fa fa-check"></span>
                                    </div>
                                    <div class="about-two__title">
                                        <h3>{{ __('about.axe4') }} </h3>
                                    </div>
                                </li>
                                <li>
                                    <div class="about-two__icon">
                                        <span class="fa fa-check"></span>
                                    </div>
                                    <div class="about-two__title">
                                        <h3>{{ __('about.axe5') }} </h3>
                                    </div>
                                </li>
                            </ul>
                            <p class="text-success">
                            {{ __('about.info_descr2') }} . <br><br>
                            </p>
                            <p>
                            {{ __('about.info_descr3') }} <br>
                            </p>
                            <p class="clignote">
                            {{ __('about.info_obc') }}
                            <br>
                        </p>

                            <center>
                                <div class="about-two__btn-box">
                                    <a href="{{route('about.index')}}" class="thm-btn">{{ __('slider.bouton') }}  <i class="icon-right-arrow"></i> </a>
                                </div>
                            </center>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <!--About Two End-->


 <section class="services-carousel-page">
            <div class="container">
                <div class="section-title text-center">
                    <h2 class="text-center item wow slideInLeft" data-wow-delay="100ms"
                        data-wow-duration="2500ms">{{ __('expertise.title1') }}</h2><br>
                </div>
                <div class="services-carousel thm-owl__carousel owl-theme owl-carousel carousel-dot-style"
                     data-owl-options='{
                "items": 4,
                "margin": 30,
                "smartSpeed": 700,
                "loop": true,
                "autoplay": 6000,
                "nav": false,
                "dots": true,
                "responsive": {
                    "0": {
                        "items": 1
                    },
                    "768": {
                        "items": 2
                    },
                    "992": {
                        "items": 3
                    }
                }
            }'>
                    @foreach($axes as $axe)
                        <div class="item">
                            <div class="services-one__single">
                                <div class="services-one__img-box">
                                    <div class="services-one__img">
                                        <img src="{{asset('assets/img/domaines')}}/{{$axe->picture2}}" alt="{{$axe->title}}" fetchpriority="high">
                                    </div>
                                </div>
                                <div class="services-one__content">
                                    <h3 class="texte_noir"><a href="{{route('domaine.show',$axe->id)}}">
                                    @if(session('locale') === 'fr')
                                {{ $axe->title }}
                            @else
                                {{ $axe->title_en }}
                            @endif
                                </a></h3>
                                    <a href="{{route('domaine.show',$axe->id)}}" class="thm-btn cta-one__btn">
                                        <span>{{ __('slider.bouton') }}</span>
                                        <i class="icon-right-arrow"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    @endforeach
                </div>
            </div>
        </section>

<section class="counter-one">
            <div class="counter-one__bg" style="background-image: url({{asset('assets/img/f.jpg')}});">
            </div>
            <div class="container">
                <div class="row">
                    <div class="col-xl-12">
                        <h1 class="text-center text-warning item wow slideInRight" data-wow-delay="100ms"
                            data-wow-duration="2500ms">{{ __('statistic.title') }}</h1>
                        <br><br>
                        <div class="counter-one__inner">
                            <ul class="list-unstyled counter-one__list">
                                <li class="counter-one__single wow slideInLeft" data-wow-delay="100ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-seeds"></span>

                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="3000000" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-success">{{ __('statistic.plant') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInLeft" data-wow-delay="200ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-cotton"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="41000" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-success">{{ __('statistic.agroforesterie') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInRight" data-wow-delay="300ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-farmer"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="25000" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-success">{{ __('statistic.producteur') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInRight" data-wow-delay="400ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-cotton"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="1000" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-success">{{ __('statistic.conserve') }}</p>
                                    </div>
                                </li>
                                <br><br>
                                <li class="counter-one__single wow slideInLeft" data-wow-delay="100ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-cotton"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="100" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-white">{{ __('statistic.jachere') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInLeft" data-wow-delay="100ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-certified"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="5" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-white">{{ __('statistic.plut') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInRight" data-wow-delay="300ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-farmer-1"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="65" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-white">{{ __('statistic.pepineriste') }}</p>
                                    </div>
                                </li>
                                <li class="counter-one__single wow slideInRight" data-wow-delay="400ms"
                                    data-wow-duration="2500ms">
                                    <div class="counter-one__icon">
                                        <span class="icon-farmer"></span>
                                    </div>
                                    <div class="counter-one__content-box count-box">
                                        <h1 class="text-white">+</h1>
                                        <h3 class="count-text text-white" data-stop="30000" data-speed="1500">00</h3>
                                        <p class="counter-one__text text-white">{{ __('statistic.sensibilise') }} </p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>


        <section class="blog-one">
            <div class="container-fluid">
                <div class="section-title text-center">
                    <h2 class="section-title__title wow slideInRight" data-wow-delay="100ms"
                        data-wow-duration="2500ms">{{ __('menu.menu_actualite') }}</h2>
                </div>
                <div class="row">
                    @foreach($actualites as $actualite)
                    <div class="col-xl-4 col-lg-4 wow slideInLeft" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="blog-one__single">
                            <div class="blog-one__img">
                                <img src="{{asset('assets/img/actualites')}}/{{$actualite->picture}}" alt="img_actualite" fetchpriority="high">
                                <div class="blog-one__date">
                                    <p>{{$actualite->date_actualite}}</p>
                                </div>
                            </div>
                            <div class="blog-one__content">
                                <h3 class="texte_noir">
                                    <a href="{{route('actualite.show',$actualite->id)}}">
                                    @if(session('locale') === 'fr')
                                {{ $actualite->title }}
                            @else
                                {{ $actualite->title_en }}
                            @endif
                            </a></h3>
                            </div>
                        </div>
                    </div>
                    @endforeach
                </div>
            </div>
        </section>

        <!--Brand One Start-->
        <section class="brand-one">
            <div class="brand-one__inner">
                <div class="container">
                    <div class="row">
                        <h2 class="text-center wow slideInUp" data-wow-delay="100ms"
                            data-wow-duration="2500ms">{{ __('about.info_partenaire') }}</h2><br><br><br>
                        <div class="col-xl-12">
                            <div class="brand-one__carousel thm-owl__carousel owl-theme owl-carousel" data-owl-options='{
                                "margin": 0,
                                "smartSpeed": 700,
                                "loop":true,
                                "autoplay": 6000,
                                "nav":false,
                                "dots":false,
                                "navText": ["<span class=\"fa fa-angle-left\"></span>","<span class=\"fa fa-angle-right\"></span>"],
                                "responsive":{
                                    "0":{
                                        "items":1
                                    },
                                    "600":{
                                        "items":2
                                    },
                                    "800":{
                                        "items":3
                                    },
                                    "1024":{
                                        "items": 4
                                    },
                                    "1200":{
                                        "items": 5
                                    }
                                }
                            }'>
                                @foreach($partenaires as $partenaire)
                                <div class="brand-one__singles">
                                    <div class="brand-one__imgs">
                                        <img src="{{asset('assets/img/partenaires')}}/{{$partenaire->picture}}" alt="{{$partenaire->title}}" fetchpriority="high">
                                    </div>
                                </div>
                                @endforeach
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>


        <!--Brand One End-->

        <!--Site Footer Start-->
        @include('components.frontend.footer')
        <!--Site Footer End-->


    </div>


    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

</body>

</html>
