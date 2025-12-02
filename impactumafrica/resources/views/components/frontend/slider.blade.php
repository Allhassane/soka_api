<section class="main-slider clearfix">
    <div class="swiper-container thm-swiper__slider" data-swiper-options='{"slidesPerView": 1, "loop": true,
                "effect": "fade",
                "pagination": {
                "el": "#main-slider-pagination",
                "type": "bullets",
                "clickable": true
                },
                "navigation": {
                "nextEl": "#main-slider__swiper-button-next",
                "prevEl": "#main-slider__swiper-button-prev"
                },
                "autoplay": {
                "delay": 5000
                }}'>
        <div class="swiper-wrapper">

            <div class="swiper-slide">
                <div class="image-layer"
                     style="background-image: url({{asset('assets/img/sliders/2.png')}});"></div>
                <!-- /.image-layer -->
                <div class="container">
                    <div class="row">
                        <div class="col-xl-12">
                            <div class="main-slider__content">
                                <p class="main-slider__sub-title">IMPACTUM</p>
                                <h2 class="main-slider__title">{{ __('slider.slogan') }}</h2>
                                <div class="main-slider__btn-box">
                                    <a href="{{route('about.index')}}" class="thm-btn main-slider-two__btn">{{ __('slider.bouton') }}<i
                                            class="icon-right-arrow"></i> </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            @foreach($axes as $axe)
                <div class="swiper-slide">
                    <div class="image-layer"
                         style="background-image: url({{asset('assets/img/domaines')}}/{{$axe->picture}});" loading="lazy"></div>
                    <!-- /.image-layer -->
                    <div class="container">
                        <div class="row">
                            <div class="col-xl-12">
                                <div class="main-slider__content">
                                    <h2 class="main-slider__title"> @if(session('locale') === 'fr')
                                {{ $axe->title }}
                            @else
                                {{ $axe->title_en }}
                            @endif</h2>
                                    <div class="main-slider__btn-box">
                                        <a href="{{route('domaine.show',$axe->id)}}" class="thm-btn main-slider-two__btn">
                                        {{ __('slider.bouton') }} <i
                                                class="icon-right-arrow"></i> </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            @endforeach

        </div>

        <div class="swiper-pagination" id="main-slider-pagination"></div>

        <!-- If we need navigation buttons -->
        <div class="main-slider__nav">
            <div class="swiper-button-prev" id="main-slider__swiper-button-next">
                <i class="icon-right-arrow"></i>
            </div>
            <div class="swiper-button-next" id="main-slider__swiper-button-prev">
                <i class="icon-right-arrow"></i>
            </div>
        </div>

    </div>
</section>
