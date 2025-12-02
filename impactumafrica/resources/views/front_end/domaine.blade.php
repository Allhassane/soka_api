<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | Axes stratégiques </title>
    <!-- favicons Icons -->
   <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="Notre expertise s'articule autour des axes suivants: l'implémentation des solutions basées sur la nature, le plaidoyer sur les enjeux climatiques, le développement communautaire et conseil stratégique">


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
</head>

<body class="custom-cursor">

<div class="custom-cursor__cursor"></div>
<div class="custom-cursor__cursor-two"></div>


<div class="page-wrapper">
    @include('components.frontend.header')

    <div class="stricky-header stricked-menu main-menu main-menu-two">
        <div class="sticky-header__content"></div><!-- /.sticky-header__content -->
    </div><!-- /.stricky-header -->

    <section class="page-header">
        <div class="page-header-bg" style="background-image: url({{asset('assets/img/f.jpg')}})">
        </div>
        <div class="container">
            <div class="page-header__inner">
                <h2>{{ __('menu.menu_expertise') }}</h2>
            </div>
        </div>
    </section>

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
                "smartSpeed": 1000,
                "loop": true,
                "autoplay": 20000,
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
                @foreach($domaines as $axe)
                    <div class="item">
                        <div class="services-one__single">
                            <div class="services-one__img-box">
                                <div class="services-one__img">
                                    <img src="{{asset('assets/img/domaines')}}/{{$axe->picture2}}" alt="">
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
                                <br>
                                @foreach ($axe->sousaxes as $data)
                                    <div class="checkout__payment__item checkout__payment__item--active">
                                        <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                        @if(session('locale') === 'fr')
                                        {!! $data->libelle !!}
                            @else
                            {!! $data->libelle_en !!}
                            @endif
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    </div>
                @endforeach
            </div>
        </div>
    </section>


    <section class="services-one">
        <div class="container">
            <div class="section-title text-center">
                <h2 class="text-center item wow slideInLeft" data-wow-delay="100ms"
                    data-wow-duration="2500ms">{{ __('expertise.pilier_title') }}</h2><br>
            </div>
            <div class="row">
                <div class="col-xl-12 col-lg-12 col-md-12 wow fadeInLeft" data-wow-delay="100ms">
                    <div class="services-one__single">
                        <div class="services-one__content">
                            <h4 class="texte_noir text_gauche wow slideInLeft" data-wow-delay="100ms"
                                data-wow-duration="2500ms">{{ __('expertise.pilier1') }}</h4><br>
                            <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier1') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier2') }}
                                    <br><br>
                                </h5>
                            </div>
                            <h4 class="texte_noir text_gauche wow slideInRight" data-wow-delay="200ms"
                                data-wow-duration="2500ms">{{ __('expertise.pilier2') }}</h4><br>
                            <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier3') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier4') }}
                                    <br><br>
                                </h5>
                            </div>
                            <h4 class="texte_noir text_gauche wow slideInLeft" data-wow-delay="300ms"
                                data-wow-duration="2500ms">{{ __('expertise.pilier3') }}</h4><br>
                            <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier5') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier6') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_pilier7') }}
                                </h5>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

<section class="blog-one">
        <div class="container-fluid">
            <div class="section-title text-center">
                <h2 class="section-title__title wow slideInRight" data-wow-delay="100ms"
                    data-wow-duration="2500ms">{{ __('expertise.beneficiaire') }}</h2>
            </div>
            <div class="row">
                    <div class="col-xl-4 col-lg-4 wow slideInLeft" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="blog-one__single">
                            <div class="blog-one__img">
                                <img src="{{asset('assets/img/about/agr_remplacer.png')}}" alt="">
                            </div>
                            <div class="blog-one__content">
                                <h3 class="texte_noir text-center">{{ __('expertise.beneficiaire1') }}</h3><br>
                                <div class="checkout__payment__item checkout__payment__item--active wow slideInLeft" data-wow-delay="100ms"
                                     data-wow-duration="2500ms">
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('expertise.content_beneficiaire1') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('expertise.content_beneficiaire2') }}
                                    </h5>
                                    <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                    {{ __('expertise.content_beneficiaire3') }}
                                    </h5>
                                </div>
                            </div>
                    </div>
            </div>
                    <div class="col-xl-4 col-lg-4 wow slideInUp" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="blog-one__single">
                        <div class="blog-one__img">
                            <img src="{{asset('assets/img/about/pse_remplacer.jpg')}}" alt="">
                        </div>
                        <div class="blog-one__content">
                            <h3 class="texte_noir text-center">{{ __('expertise.beneficiaire2') }}</h3><br>
                            <div class="checkout__payment__item checkout__payment__item--active wow slideInUp" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire4') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire5') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire6') }}
                                </h5>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="blog-one__single">
                        <div class="blog-one__img">
                            <img src="{{asset('assets/img/about/producteur.jpg')}}" alt="">
                        </div>
                        <div class="blog-one__content">
                            <h3 class="texte_noir text-center">{{ __('expertise.beneficiaire3') }}</h3><br>
                            <div class="checkout__payment__item checkout__payment__item--active wow slideInRight" data-wow-delay="100ms"
                                 data-wow-duration="2500ms">
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire7') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire8') }}
                                </h5>
                                <h5 class="checkout__payment__title checkout__payment__item--active noir">
                                {{ __('expertise.content_beneficiaire9') }}
                                </h5>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    

    <!--Site Footer Start-->
    @include('components.frontend.footer')
    <!--Site Footer End-->


</div><!-- /.page-wrapper -->

</body>

</html>
