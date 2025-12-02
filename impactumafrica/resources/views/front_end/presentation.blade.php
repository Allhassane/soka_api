<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | A propos </title>
    <!-- favicons Icons -->
  <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="Apporter un IMPACT positif, en tenant compte du momenTUM, nous concevons, mettons en place et déployons de solutions, programmes et projets transformationnels permettant des changements pertinents et impactant.">


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
    <script type="text/javascript" src="{{asset('assets/js/my_script.js')}}"></script>

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
        <div class="sticky-header__content"></div><!-- /.sticky-header__content -->
    </div>

    <section class="page-header">
        <div class="page-header-bg" style="background-image: url({{asset('assets/img/sliders/bg4.jpeg')}})">
        </div>
        <div class="container">
            <div class="page-header__inner">
                <h2>{{__('menu.menu_presentation')}}</h2>
            </div>
        </div>
    </section>
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
                        </div>
                    </div>
                </div>
            </div>
        </section>

    <section class="cta-one">
        <div class="cta-one__bg" data-jarallax data-speed="0.2" data-imgPosition="50% 0%"
             style="background-image: url({{asset('assets/img/sliders/2.png')}});"></div>
        <div class="container">
            <div class="row">
                <div class="col-xl-12">
                    <h3 class="cta-one__title text-center wow slideInLeft" data-wow-delay="100ms"
                        data-wow-duration="2500ms">{{ __('about.info_mission_title') }}</h3><br>
                    <div class="cta-one__inner wow slideInRight" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="cta-one__left">
                            <p class="text-center">
                                <font color="white" size="+2">
                                {{ __('about.info_mission') }}
                                </font>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="healthy-food-one">
        <div class="container">
            <div class="row">
                <div class="col-xl-6 wow slideInLeft" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <h2 class="">{{ __('about.info_metrique') }}</h2><br>
                    <div class="healthy-food-one__left">
                        <div class="healthy-food-one__img">
                            <img src="{{asset('assets/img/about/metrike_update.png')}}" alt="">
                        </div>
                    </div>
                </div>
                <div class="col-xl-6 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <h2 class="">{{ __('about.info_cartographie') }}</h2><br>
                    <div class="healthy-food-one__left">
                        <div class="healthy-food-one__img">
                            <img src="{{asset('assets/img/about/cartographie_new.png')}}" alt="">
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </section>

    <section class="services-one">
        <div class="container">
            <div class="section-title text-center">
                <h2 class="text-center item wow slideInLeft" data-wow-delay="100ms"
                    data-wow-duration="2500ms">{{ __('about.info_defis_title') }}</h2><br>
            </div>
            <div class="row">
                    <div class="col-xl-12 col-lg-12 col-md-12 wow fadeInLeft" data-wow-delay="100ms">
                        <div class="services-one__single">
                            <div class="services-one__content">
                                <h4 class="texte_noir text_gauche wow slideInLeft" data-wow-delay="100ms"
                                    data-wow-duration="2500ms">{{ __('about.info_defis1') }}</h4><br>
                                <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                     data-wow-duration="2500ms">
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content1') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content2') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content3') }}
                                    </h5>
                                </div>
                                <br>
                                <h4 class="texte_noir text_gauche wow slideInRight" data-wow-delay="200ms"
                                    data-wow-duration="2500ms">{{ __('about.info_defis2') }} </h4>
                                <br>
                                <div class="checkout__payment__item checkout__payment__item--active wow slideInRight" data-wow-delay="100ms"
                                     data-wow-duration="2500ms">
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content4') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content5') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content6') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                        P{{ __('about.info_defis_content7') }}
                                    </h5>
                                </div>
                                <br>
                                <h4 class="texte_noir text_gauche wow slideInLeft" data-wow-delay="300ms"
                                    data-wow-duration="2500ms">{{ __('about.info_defis3') }}</h4>
                                <br>
                                <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                     data-wow-duration="2500ms">
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content8') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content9') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('about.info_defis_content10') }}
                                    </h5>
                                </div>

                            </div>
                        </div>
                    </div>
            </div>
        </div>
    </section>

    <section class="project-page-one">
        <div class="container">
            <div class="row">
                <div class="section-title text-center">
                    <h2 class="section-title__title wow slideInLeft" data-wow-delay="100ms"
                        data-wow-duration="2500ms">{{ __('about.info_valeur_title') }}</h2>
                </div>
                <!--Project Page One Single Start-->
                <div class="col-xl-3 col-lg-6 col-md-6 wow slideInLeft" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="project-one__single">
                        <div class="project-one__inner">
                            <div class="project-one__imge">
                                <img src="{{asset('assets/img/about/transparence.jpg')}}" alt="" class="img_valeur">
                            </div>
                            <div class="project-one__content">
                                <span class="project-one__tagline">{{ __('about.info_transparence') }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-lg-6 col-md-6 wow slideInLeft" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="project-one__single">
                        <div class="project-one__inner">
                            <div class="project-one__imge">
                                <img src="{{asset('assets/img/about/integrite.jpg')}}" alt="" class="img_valeur">
                            </div>
                            <div class="project-one__content">
                                <span class="project-one__tagline text-dark">{{ __('about.info_integrite') }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-lg-6 col-md-6 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="project-one__single">
                        <div class="project-one__inner">
                            <div class="project-one__imge">
                                <img src="{{asset('assets/img/about/egalite.jpg')}}" alt="" class="img_valeur">
                            </div>
                            <div class="project-one__content">
                                <span class="project-one__tagline text-dark">{{ __('about.info_equite') }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-lg-6 col-md-6 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="project-one__single">
                        <div class="project-one__inner">
                            <div class="project-one__imge">
                                <img src="{{asset('assets/img/about/engagement.jpg')}}" alt="" class="img_valeur">
                            </div>
                            <div class="project-one__content">
                                <span class="project-one__tagline text-dark">{{ __('about.info_engagement') }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
    <!--Brand One Start-->
    <section class="brand-one">
        <div class="brand-one__inner">
            <div class="container">
                <div class="row">
                    <div class="section-title text-center">
                        <h2 class="section-title__title wow slideInLeft" data-wow-delay="100ms"
                            data-wow-duration="2500ms">{{ __('about.info_equipe_title') }}</h2>
                    </div>
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
                            @foreach($equipes as $equipe)
                                <div class="brand-one__singles">
                                    <div class="">
                                        <img src="{{asset('assets/img/personnel')}}/{{$equipe->picture}}" alt="" class="img_personel">
                                        <p class="text-center">
                                            {{$equipe->name}} <br>
                                            @if(session('locale') === 'fr')
                                    {{$equipe->fonction}}
                            @else
                            {{$equipe->fonction_en}}
                            @endif
                                        </p>
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


</div><!-- /.page-wrapper -->

</body>

</html>
