$(function () {
  const path = window.location.pathname;
  $('.list-group-item[data-path]').each(function () {
    const target = $(this).data('path');
    if (path.endsWith(target)) {
      $(this).addClass('active');
    }
  });

  $('#ano-actual').text(new Date().getFullYear());
});
