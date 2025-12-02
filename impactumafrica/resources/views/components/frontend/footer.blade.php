<footer class="site-footer">
    <div class="site-footer__top">
        <div class="container">
            <div class="site-footer__top-inner">
                <div class="row">
                    <div class="col-xl-4 col-lg-6 col-md-6 wow slideInLeft" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="footer-widget__column footer-widget__about">
                            <div class="footer-widget__logo">
                                <a href="{{route('index')}}"><img src="{{asset('assets/img/logo/new_logo.png')}}" alt=""></a>
                            </div>
                            <div class="footer-widget__about-text-box">
                                <p class="footer-widget__about-text">{{ __('footer.section1') }} </p>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-4 col-lg-6 col-md-6 wow slideInDown" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="footer-widget__column footer-widget__Explore">
                            <div class="footer-widget__title-box">
                                <h3 class="footer-widget__title">{{ __('footer.section2_title') }} </h3>
                            </div>
                            <div class="row d-flex">
                                <div class="col-6">
                                    <ul class="footer-widget__Explore-list list-unstyled">
                                        <li class=""><a href="{{route('index')}}">{{ __('menu.menu_accueil') }}</a></li>
                                        <li><a href="{{route('about.index')}}">{{ __(key: 'menu.menu_presentation') }}</a></li>
                                        <li><a href="{{route('domaine.index')}}">{{ __('menu.menu_expertise') }}</a></li>
                                        <li><a href="{{route('projet.index')}}">{{ __('menu.menu_projet_realise') }} </a></li>
                                    </ul>
                                </div>
                                <div class="col-6">
                                    <ul class="footer-widget__Explore-list list-unstyled">
                                        <li><a href="{{route('etude.index')}}">{{ __('menu.menu_etude') }}</a></li>
                                        <li><a href="{{route('actualite.index')}}">{{ __('menu.menu_actualite') }}</a></li>
                                        <li><a href="{{route('recrutement.index')}}">{{ __('menu.menu_recrutement') }}</a></li>
                                        <li><a href="{{route('contact.index')}}">{{ __('menu.menu_contact') }} </a></li>
                                    </ul>
                                </div>
                                
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-4 col-lg-6 col-md-6 wow slideInRight" data-wow-delay="100ms"
                         data-wow-duration="2500ms">
                        <div class="footer-widget__column footer-widget__Contact">
                            <div class="footer-widget__title-box">
                                <h3 class="footer-widget__title">{{ __('footer.section3_title') }}</h3>
                            </div>
                            <ul class="footer-widget__Contact-list list-unstyled">
                                <li>
                                    <div class="icon">
                                        <span class="fas fa-phone-square-alt"></span>
                                    </div>
                                    <div class="text">
                                        <p><a href="tel:+2250758683731">+225 2722525954 <br> +225 0758683731 </a></p>
                                    </div>
                                </li>
                                <li>
                                    <div class="icon">
                                        <span class="fas fa-envelope"></span>
                                    </div>
                                    <div class="text">
                                        <p><a href="mailto:contact@impactum.africa">contact@impactum.africa</a></p>
                                    </div>
                                </li>
                                <li>
                                    <div class="icon">
                                        <span class="icon-pin"></span>
                                    </div>
                                    <div class="text">
                                        <p>{{ __('menu.info_localisation') }}</p>
                                    </div>
                                </li>
                            </ul>

                        </div>
                    </div>
                </div>
                <br>
                <div class="row wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="col-xl-4 col-lg-6 col-md-6 wow fadeInUp"></div>
                    <div class="col-xl-4 col-lg-6 col-md-6 wow fadeInUp"  data-wow-delay="500ms">
                        <div class="footer-widget__title-box">
                            <h3 class="footer-widget__title text-center">{{ __('footer.newsletter_title') }}</h3>
                        </div>
                        <form action="{{route('newsletter')}}" method="post" class="footer-widget__Contact-form">
                            @csrf
                            <div class="footer-widget__Contact-input-box">
                                <input type="email" placeholder="{{ __('footer.newsletter_placeholder') }}" required name="email">
                                <button type="submit" class="footer-widget__Contact-btn"><i
                                        class="icon-right-arrow"></i></button>
                            </div>
                        </form>
                    </div>
                    <div class="col-xl-4 col-lg-6 col-md-6 wow fadeInUp"></div>
                </div>
            </div>
        </div>
    </div>
    <div class="site-footer__bottom">
        <div class="container-fluid">
            <div class="row">
                <div class="col-xl-12">
                    <div class="site-footer__bottom-inner">
                        <p class="site-footer__bottom-text">© Copyright {{date('Y')}} by <a href="#">IMPACTUM</a></p>
                        <div class="site-footer__social">
                            <a href="https://www.facebook.com/Impactum.africa" target="_blank"><i class="fab fa-facebook"></i></a>
                            <a href="https://www.instagram.com/ong_impactum/" target="_blank"><i class="fab fa-instagram"></i></a>
                            <a href="https://www.linkedin.com/company/ong-impactum/" target="_blank"><i class="fab fa-linkedin"></i></a>

                        </div>
                        <div class="site-footer__bottom-scroll">
                            <a href="#" data-target="html" class="scroll-to-target scroll-to-top"><i
                                    class="icon-up-arrow"></i></a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</footer>


<script src="{{asset('assets/vendors/jquery/jquery-3.6.0.min.js')}}"></script>
<script src="{{asset('assets/vendors/bootstrap/js/bootstrap.bundle.min.js')}}"></script>
<script src="{{asset('assets/vendors/jarallax/jarallax.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-ajaxchimp/jquery.ajaxchimp.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-appear/jquery.appear.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-circle-progress/jquery.circle-progress.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-magnific-popup/jquery.magnific-popup.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-validate/jquery.validate.min.js')}}"></script>
<script src="{{asset('assets/vendors/nouislider/nouislider.min.js')}}"></script>
<script src="{{asset('assets/vendors/odometer/odometer.min.js')}}"></script>
<script src="{{asset('assets/vendors/swiper/swiper.min.js')}}"></script>
<script src="{{asset('assets/vendors/tiny-slider/tiny-slider.min.js')}}"></script>
<script src="{{asset('assets/vendors/wnumb/wNumb.min.js')}}"></script>
<script src="{{asset('assets/vendors/wow/wow.js')}}"></script>
<script src="{{asset('assets/vendors/isotope/isotope.js')}}"></script>
<script src="{{asset('assets/vendors/countdown/countdown.min.js')}}"></script>
<script src="{{asset('assets/vendors/owl-carousel/owl.carousel.min.js')}}"></script>
<script src="{{asset('assets/vendors/bxslider/jquery.bxslider.min.js')}}"></script>
<script src="{{asset('assets/vendors/bootstrap-select/js/bootstrap-select.min.js')}}"></script>
<script src="{{asset('assets/vendors/vegas/vegas.min.js')}}"></script>
<script src="{{asset('assets/vendors/jquery-ui/jquery-ui.js')}}"></script>
<script src="{{asset('assets/vendors/timepicker/timePicker.js')}}"></script>
<script src="{{asset('assets/vendors/circleType/jquery.circleType.js')}}"></script>
<script src="{{asset('assets/vendors/circleType/jquery.lettering.min.js')}}"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
    @if (session('success'))

    Swal.fire({
        icon: 'success',
        title: '{{ session('success') }}'
    });
    @endif

    @if (session('error'))

    Swal.fire({
        icon: 'error',
        title: '{{ session('error') }}'
    });
    @endif
</script>

@include('components.frontend.mobile_nav')

<!-- template js -->
<script src="{{asset('assets/js/agrion.js')}}"></script>

