"use strict";

var controller = {

  map: {

    /**
     * Instantiates google Map object
     * @param {object} startLatLng - where map is centered on initialization.
     * @param {number} zoom - starting zoom level of map on initilization.
     * @return map {object}
    **/

    create: function(startLatLng, zoom) {

      try {
        var map = new google.maps.Map(document.getElementById('map-canvas'), {
          center: startLatLng,
          zoom: zoom
        });

        // Set map height to window height
        $("#map-canvas").css("height", window.innerHeight);

        return map;
      }
      catch(err){
        controller.helpers.handleError("Google maps is not loading. This may be due to not having an internet connection.");
      }

    },

    get: function(){
      return model.map;
    }
  },

  // Includes all methods that deal with instances of the Location class
  location: {

    /**
     * Creates a new marker object
     * @param {object} latLng - where map is centered on initialization.
     * @param {string} name
     * @returns {object}
    **/

    createMarker: function(latLng, name){

      var newMarker  = new google.maps.Marker({
        position: latLng,
        title: name,
        map: controller.map.get()
      });

      return newMarker;
    },

    handleMarkerClick: function(Location, marker) {

      // close previously clicked marker's infowindow
      if (model.state.prev_infowindow) {
        model.state.prev_infowindow.close();
      }

      // Animate marker
      controller.location.animateMarker(marker);

      // Add active class to selected Location's link
      $('.active').removeClass('active');
      $("a[data-location='" + Location.nameString() +"']").addClass('active');

      // Open infowindow
      marker['infowindow'].open(controller.map.get(), marker);

      // Set prev_infowindow to most recently clicked marker
      model.state.prev_infowindow = marker['infowindow'];
    },

    closeInfowindow: function(Location) {
      return Location.marker.infowindow.close();
    },

    animateMarker: function(marker) {
      // start bounce
      marker.setAnimation(google.maps.Animation.BOUNCE);
      // stop bounce after x MS
      window.setTimeout(function(){ marker.setAnimation(null) }, 1400);
    },

    createInfowindow: function() {
      var infowindow = new google.maps.InfoWindow({
        content: '<p> Loading... </p>'
      });
      return infowindow;
    },

    updateInfowindow: function(Location) {
      var infowindow = Location.marker.infowindow,
          fsq = Location.data.foursquare,
          yelp = Location.data.yelp,
          htmlString = '';
      htmlString =
      '<h1>' + fsq.name + '</h1>' +
      '<h5>' +
        '<a target="_blank" href="' + fsq.shortUrl + '">' + 'Foursquare Profile' + '</a>' + ' | ' +
        '<a target="_blank" href="' + yelp.url + '">' + 'Yelp Profile' + '</a>' + ' | ' +
        '<a target="_blank" href="' + fsq.url + '">' + 'Website' + '</a>'  +
      '</h5>' +
      '<p>' + fsq.location.address + ', ' + fsq.location.city + ' ' + fsq.location.state + '</p>' +
      '<p>' + fsq.contact.formattedPhone + '</p>' +
      '<hr>' +
      '<ul>' +
        '<li>' + 'Ratings ' +
          '<ul>' +
            '<li> Foursquare: ' + fsq.rating + ' / 10' + '</li>' +
            '<li> Yelp: ' + yelp.rating + ' / 5' + '</li>' +
          '</ul>' +
        '</li>' +
        '<li>' + 'Review Counts ' +
          '<ul>' +
            '<li> Foursquare '+ fsq.ratingSignals + '</li>' +
            '<li> Yelp: '+ yelp.review_count  + '</li>' +
          '</ul>' +
        '</li>' +
      '</ul>';

      // Update infowindow with new string
      infowindow.content = htmlString;
    },

    // Toggle visibility of a Location's marker by setting its isVisible property
    // This property is 'listened to' by Knockout
    toggleVisibility: function(Location){
      Location.isVisible(!Location.isVisible());
    }

  },

  // methods related to getting and handling data from all APIs
  api: {

    initRequests: function(Locations) {

      // Call 3rd Party APIs
      // Each call is wrapped in a Promise
      var getFsq = controller.api.getFsq(Locations);
      var getYelp = controller.api.getYelp(Locations);

      // When each Promise is resolved, prepare infowindow content and update all infowindows
      Promise.all([getFsq, getYelp]).then(function(results){

        Locations.forEach(function(Location){
          controller.location.updateInfowindow(Location);
        });

        console.log("Il est fini!");

      });

    },

    getYelp: function(Locations) {

      return new Promise(function(resolve, reject) {

        var counter = Locations.length;
        var resolveYelpFn = function(){console.log("getYelp resolved!")};

        Locations.forEach(function(Location){

          var url = model.API.YELP.CONTEXT.BASE_URL + Location.data.yelp.businessId,
              consumer_secret = model.API.YELP.AUTH_SECRET.consumer_secret,
              token_secret = model.API.YELP.AUTH_SECRET.token_secret;

          var params = {
            oauth_consumer_key: model.API.YELP.AUTH_PUBLIC.oauth_consumer_key,
            oauth_token: model.API.YELP.AUTH_PUBLIC.oauth_token,
            oauth_nonce: controller.helpers.nonce_generate(),
            oauth_timestamp: controller.helpers.timestamp_generate(),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_version : '1.0',
            callback: 'cb'
         };

          // Generate oauthSignature / add to params object
          var encodedSignature = oauthSignature.generate('GET', url, params, consumer_secret, token_secret);
          params.oauth_signature = encodedSignature;

          // Call API
          $.ajax({
            url: url,
            cache: true,
            data: params,
            dataType: 'jsonp'
          })
          .done(function(results, status, xhr) {
            console.log("Yelp call complete!");
            // save Yelp data to Location instance
            Location.data.yelp = results;
          })
          .fail(function(m){
            controller.helpers.handleError("Whoops! The Yelp API isn't loading.");
          })
          .always(function(xhr, status){
            counter--;
            if(counter === 0) {
              resolve(resolveYelpFn());
            }
          });

        });

      });

    },

    getFsq: function(Locations) {

      return new Promise(function(resolve, reject) {

        var counter = Locations.length;
        var resolveFn = function(){console.log("getFsq resolved!")}

        Locations.forEach(function(Location) {

          var url = model.API.FOURSQUARE.CONTEXT.BASE_URL + Location.data.foursquare.venue_id,
              params = {
                client_id: model.API.FOURSQUARE.AUTH_PUBLIC.CLIENT_ID,
                client_secret: model.API.FOURSQUARE.AUTH_SECRET.CLIENT_SECRET,
                v: new Date().toISOString().slice(0,10).replace(/-/g, "")
              };

          $.ajax({
            url: url,
            data: params
          })
          .done(function(result) {
            console.log("Foursquare call complete!");
            // Append foursquare data to Location instance
            var fsq = result.response.venue;
            Location.data.foursquare = fsq;

          })
          .fail(function(m){
            controller.helpers.handleError("Whoops! The Yelp API isn't loading.");
          })
          .always(function(xhr, status){
            // deincrement counter
            // when counter reaches 0, resolve Promise
            counter--;
            if(counter === 0) {
              resolve(resolveFn());
            }
          });
        });

      });
    }
  }, // end api

  // Various helper functions
  helpers: {

    handleError: function(msg){
      return alert(msg);
    },

    nonce_generate: function() {
      return (Math.floor(Math.random() * 1e12).toString());
    },

    timestamp_generate: function(){
      return Math.floor(Date.now()/1000);
    },

    bindGlobalEventListeners: function(){

      // Shortcut events
        // Declare keyboard shortcut functions
        function _searchLocations(e){
          e.preventDefault();
          $('#search-input').focus();
        }
        // Bind shortcut functions to shortcut keys
        Mousetrap.bind('s', function(e){
          _searchLocations(e);
        });

      // Show / hide nav animation on mobile
        // On click of nav button
        $("#btn-nav-toggle").click(function(){
          // toggle visibility of list items && rotate icon
          $("#nav-container").slideToggle(500);
          $("i.fa-caret-square-o-down").toggleClass("fa-rotate-180");
        });

    }

  }
};
