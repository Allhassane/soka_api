<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no" name="viewport">
    <title>ONG IMPACTUM - Admin Template</title>
    <!-- General CSS Files -->
    <link rel="stylesheet" href="{{asset('admin/assets/css/app.min.css')}}">
    <!-- Template CSS -->
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/prism/prism.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/datatables/datatables.min.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/datatables/DataTables-1.10.16/css/dataTables.bootstrap4.min.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/css/style.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/css/components.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/jqvmap/dist/jqvmap.min.css')}}">
    <!-- Custom style CSS -->
    <link rel="stylesheet" href="{{asset('admin/assets/css/custom.css')}}">
    <link rel='shortcut icon' type='image/x-icon' href='{{asset('assets/img/logo.png')}}' />
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
    <!-- Leaflet MarkerCluster CSS -->
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />

</head>

<body>
<div class="loader"></div>
    <div class="main-wrapper main-wrapper-1">
        <div class="navbar-bg"></div>
        @include('components.admin.admin_topbar')

        @include('components.admin.menu')
        <main class="py-4">
            @yield('content')
        </main>
        <footer class="main-footer">
            <div class="footer-left">
                Copyright &copy; 2025 <div class="bullet"></div> Design By <a href="https://impactum.africa" target="_blank">IMPACTUM</a>
            </div>
            <div class="footer-right">
            </div>
        </footer>
    </div>
<!-- General JS Scripts -->
<script src="{{asset('admin/assets/js/app.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/prism/prism.js')}}"></script>
<!-- JS Libraies -->
<script src="{{asset('admin/assets/bundles/apexcharts/apexcharts.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/index.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/xy.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/percent.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/radar.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/Animated.js')}}"></script>
<!-- Page Specific JS File -->
<script src="{{asset('admin/assets/js/page/index2.js')}}"></script>
<!-- Page Specific JS File -->
<script src="{{asset('admin/assets/bundles/datatables/datatables.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/DataTables-1.10.16/js/dataTables.bootstrap4.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/dataTables.buttons.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/buttons.flash.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/jszip.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/pdfmake.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/vfs_fonts.js')}}"></script>
<script src="{{asset('admin/assets/bundles/datatables/export-tables/buttons.print.min.js')}}"></script>
<script src="{{asset('admin/assets/js/page/datatables.js')}}"></script>
{{--end datatable--}}
<!-- Template JS File -->
<script src="{{asset('admin/assets/js/scripts.js')}}"></script>
<!-- Custom JS File -->
<script src="{{asset('admin/assets/js/custom.js')}}"></script>
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

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>


</body>

</html>
