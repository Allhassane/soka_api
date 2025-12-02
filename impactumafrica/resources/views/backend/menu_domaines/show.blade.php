@extends('layouts.app_admin')
@section('content')
    <div id="wrapper">

        <!-- Sidebar -->
    @include('inc.admin_navbar')
    <!-- End of Sidebar -->

        <!-- Content Wrapper -->
        <div id="content-wrapper" class="d-flex flex-column">

            <!-- Main Content -->
            <div id="content">
                <!-- Topbar -->
            @include('inc.admin_topbar')
            <!-- End of Topbar -->
                <!-- Begin Page Content -->
                <div class="container-fluid">

                    <!-- Page Heading -->
                    <div class="d-sm-flex align-items-center justify-content-between mb-4">
                        <h1 class="h3 mb-0 text-gray-800">Domaine d'activité {{$data->title}}</h1>
                        <a href="{{route('domaine.list')}}" class="d-none d-sm-inline-block btn btn-sm btn-primary shadow-sm"><i
                                class="fas fa-backward fa-sm text-white-50"></i> Retourner sur la liste</a>
                    </div>

                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
{{--                            <h6 class="m-0 font-weight-bold text-primary">DataTables Example</h6>--}}
                        </div>
                        <div class="card-body">
                            {{$data->title}}
                        </div>
                    </div>

                </div>

            </div>
        </div>
        <!-- End of Content Wrapper -->

    </div>
@endsection
