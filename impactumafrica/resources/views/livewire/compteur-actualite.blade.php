<div wire:poll.10s> {{-- rafraîchit toutes les 10 secondes --}}
    <a class="nav-link position-relative d-flex align-items-center" href="{{ route('actualite.index') }}">
        @if($nombre > 0)
            <span class="me-1 badge rounded-pill bg-success flash-rapide">
            {{ $nombre }}
            </span>
        @endif
            <i class="fas fa-bell"></i>
    </a>

</div>
