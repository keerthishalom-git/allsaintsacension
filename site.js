/* ============================================================
   Builds the header, navigation, mobile menu, and footer on
   every page. All links point to LOCAL pages (this new site).
   ============================================================ */
(function(){
  var LOGO="logo.png";
  var here=(location.pathname.split("/").pop()||"index.html").toLowerCase()||"index.html";
  function act(page){return here===page?" active":"";}

  var header =
  '<div class="announce-bar">🌿 Join us this Sunday at 9:00 AM for Holy Eucharist. All are welcome.'+
    ' <a href="schedule.html">View Full Schedule →</a></div>'+
  '<header><div class="header-inner">'+
    '<a href="index.html" class="logo-wrap"><img src="'+LOGO+'" alt="All Saints and Ascension Logo">'+
      '<div class="logo-text"><div class="name">All Saints and Ascension</div><div class="sub">Episcopal Church · Northwoods, MO</div></div></a>'+
    '<nav>'+
      '<div class="nav-item'+act("about.html")+'"><a href="about.html">About Us ▾</a><div class="dropdown">'+
        '<a href="im-new.html">I\'m New Here</a><a href="about.html">This Is Us: Our History</a>'+
        '<a href="about.html#episcopal">The Episcopal Church</a>'+
        '<a href="about.html#vestry">Vestry &amp; Leadership</a><a href="about.html#ministries">Our Ministries</a></div></div>'+
      '<div class="nav-item'+act("news.html")+act("funeral-notices.html")+'"><a href="news.html">News ▾</a><div class="dropdown">'+
        '<a href="news.html">News &amp; Announcements</a>'+
        '<a href="funeral-notices.html">Funeral Notices</a></div></div>'+
      '<div class="nav-item'+act("schedule.html")+'"><a href="schedule.html">Schedule ▾</a><div class="dropdown">'+
        '<a href="schedule.html">Worship &amp; Events</a>'+
        '<a href="watch.html">Watch Live</a></div></div>'+
      '<div class="nav-item'+act("resources.html")+'"><a href="resources.html">Resources ▾</a><div class="dropdown">'+
        '<a href="resources.html">Worship Bulletins</a><a href="resources.html#forms">Forms &amp; Flyers</a>'+
        '<a href="gallery.html">Photo Gallery</a></div></div>'+
      '<div class="nav-item'+act("contact.html")+act("giving.html")+'"><a href="contact.html">Connect ▾</a><div class="dropdown">'+
        '<a href="contact.html">Contact Us</a>'+
        '<a href="giving.html">Give Online</a></div></div>'+
      '<a href="im-new.html" class="nav-item nav-cta">Plan Your Visit</a>'+
    '</nav>'+
    '<button class="hamburger" onclick="ASA_open()" aria-label="Open menu"><span></span><span></span><span></span></button>'+
  '</div></header>'+
  '<div class="mobile-menu" id="mob"><div class="mobile-menu-top">'+
    '<div style="font-family:\'Playfair Display\',serif;font-size:1rem;color:var(--red)">All Saints and Ascension</div>'+
    '<button class="mobile-close" onclick="ASA_close()">✕ Close</button></div>'+
    '<div class="mobile-nav">'+
      '<a href="index.html">🏠 Home</a><a href="im-new.html">✝ I\'m New Here</a><a href="about.html">About Us</a>'+
      '<a href="about.html#ministries">Ministries</a><a href="schedule.html">Schedule</a><a href="news.html">News</a>'+
      '<a href="gallery.html">Gallery</a><a href="resources.html">Resources</a><a href="funeral-notices.html">Funeral Notices</a><a href="watch.html">▶ Watch Live</a>'+
      '<a href="contact.html">Contact</a><a href="giving.html" class="mobile-give">💛 Give Online</a></div></div>';

  var footer =
  '<footer><div class="footer-inner">'+
    '<div class="footer-brand"><div class="footer-brand-name">All Saints and Ascension</div>'+
      '<p>An Episcopal congregation rooted in faith, love, and service, welcoming all to the Light of Christ in Northwoods, Missouri.</p>'+
      '<div class="social-row"><a href="https://www.facebook.com/ALLSAINTSASCENSION/" target="_blank" rel="noopener" class="social-btn" title="Facebook">f</a>'+
      '<a href="watch.html" class="social-btn" title="Watch Live">▶</a>'+
      '<a href="https://diocesemo.org/" target="_blank" rel="noopener" class="social-btn" title="Diocese of Missouri">✝</a></div></div>'+
    '<div class="footer-col"><h4>Navigate</h4><ul>'+
      '<li><a href="im-new.html">I\'m New Here</a></li><li><a href="about.html">About Us</a></li>'+
      '<li><a href="about.html#vestry">Vestry</a></li><li><a href="about.html#episcopal">Episcopal Church</a></li>'+
      '<li><a href="funeral-notices.html">Funeral Notices</a></li><li><a href="gallery.html">Photo Gallery</a></li></ul></div>'+
    '<div class="footer-col"><h4>Ministries &amp; Resources</h4><ul>'+
      '<li><a href="about.html#food">Food Pantry</a></li><li><a href="about.html#music">Music Ministry</a></li>'+
      '<li><a href="about.html#justice">Social Justice</a></li><li><a href="resources.html">Worship Bulletins</a></li>'+
      '<li><a href="giving.html">Give Online</a></li></ul></div>'+
    '<div class="footer-col"><h4>Contact &amp; Hours</h4><div class="footer-contact-info"><p>'+
      '<strong>4520 Lucas and Hunt Rd</strong><br>Northwoods, MO 63121<br><br>'+
      '<strong>📞 314-367-2314</strong><br><br><strong>Office Hours</strong><br>'+
      'Rector: Tue–Fri, 9 AM–5 PM<br>Admin: Mon–Wed, 9 AM–3 PM</p></div></div>'+
  '</div><div class="footer-bottom">'+
    '<p>© '+new Date().getFullYear()+' All Saints and Ascension Episcopal Church · Northwoods, MO · '+
      '<a href="https://diocesemo.org/" target="_blank" rel="noopener">Episcopal Diocese of Missouri</a></p>'+
    '<p><a href="contact.html">Contact</a> · <a href="giving.html">Give</a> · <a href="watch.html">Watch Live</a></p>'+
  '</div></footer>';

  var h=document.getElementById("site-header"); if(h) h.innerHTML=header;
  var f=document.getElementById("site-footer"); if(f) f.innerHTML=footer;
})();
function ASA_open(){document.getElementById("mob").classList.add("open")}
function ASA_close(){document.getElementById("mob").classList.remove("open")}
